import { PrismaService } from '@@db';
import { AppException } from '@@exceptions';
import { ActorType, DriverStatus, Prisma, ShipmentStatus } from '@@prisma';
import { runTransition, type ShipmentEventInput, type ShipmentMachineState } from '@@state-machines';
import { Command, CommandHandler, ICommandHandler } from '@nestjs/cqrs';

import { SHIPMENT_ERRORS } from '../../shipment.error';

interface TransitionShipmentResult {
  id: number;
  previousStatus: ShipmentStatus;
  currentStatus: ShipmentStatus;
}

export class TransitionShipmentCommand extends Command<TransitionShipmentResult> {
  constructor(public readonly props: TransitionShipmentCommandProps) {
    super();
  }
}

@CommandHandler(TransitionShipmentCommand)
export class TransitionShipmentCommandHandler
  implements ICommandHandler<TransitionShipmentCommand, TransitionShipmentResult>
{
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Shipment 상태 전이의 유일한 통로.
   *
   * 절차:
   *   1) 현재 shipment 로드 (routePlan/현재 driver 컨텍스트 포함)
   *   2) XState machine에 이벤트 던져서 다음 상태 계산 (guard 실패 시 same-state 반환)
   *   3) 다음 상태가 같으면 INVALID_TRANSITION 예외
   *   4) 트랜잭션 안에서 shipment.status 업데이트 + shipmentEvent 로그 + 부수효과 실행
   *
   * 부수효과 (같은 트랜잭션 안):
   *   - MARK_PICKED_UP → driver 상태를 BUSY로 유지, currentHub null 처리
   *   - ARRIVE_AT_ORIGIN_HUB → currentHub = originHub, pickup 담당 driver 할당 종료 + AVAILABLE
   *   - DISPATCH_LINE_HAUL → currentHub null (허브 사이)
   *   - ARRIVE_AT_HUB → currentHub = routePlan.hops[nextIndex]
   *   - DELIVER → currentHub = destinationHub, last-mile driver 할당 종료 + AVAILABLE, deliveryProof 저장
   *   - FAIL_DELIVERY → failureReason 저장
   */
  async execute(command: TransitionShipmentCommand): Promise<TransitionShipmentResult> {
    const { shipmentId, actorType, actorId } = command.props;
    const event = command.props.event;

    return await this.prisma.$transaction(async (tx) => {
      const shipment = await tx.shipment.findUnique({
        where: { id: shipmentId },
        include: { routePlan: true, assignments: { where: { status: 'ACTIVE' } } },
      });

      if (!shipment) {
        throw new AppException(SHIPMENT_ERRORS.NOT_FOUND);
      }

      const context = {
        driverId: shipment.assignments.at(0)?.driverId ?? null,
        currentHopIndex: shipment.routePlan?.currentHopIndex ?? 0,
        totalHops: (shipment.routePlan?.hops as string[] | undefined)?.length ?? 1,
        failureCount: 0,
        maxRetries: 2,
      };

      const result = runTransition({
        currentStatus: shipment.status as ShipmentMachineState,
        context,
        event,
      });

      if (!result.changed) {
        throw new AppException(SHIPMENT_ERRORS.INVALID_TRANSITION);
      }

      const nextStatus = result.nextStatus as ShipmentStatus;

      const patch = await this.buildSideEffects({
        tx,
        shipmentId,
        event,
        nextStatus,
        currentHubId: shipment.currentHubId,
        originHubId: shipment.originHubId,
        destinationHubId: shipment.destinationHubId,
        routePlanId: shipment.routePlan?.id,
        routeHops: (shipment.routePlan?.hops as string[] | undefined) ?? [],
        currentHopIndex: shipment.routePlan?.currentHopIndex ?? 0,
      });

      await tx.shipment.update({
        where: { id: shipmentId },
        data: { status: nextStatus, ...patch },
      });

      await tx.shipmentEvent.create({
        data: {
          shipmentId,
          fromStatus: shipment.status,
          toStatus: nextStatus,
          eventType: event.type,
          payload: event as Prisma.InputJsonValue,
          actorType,
          actorId,
        },
      });

      return {
        id: shipmentId,
        previousStatus: shipment.status,
        currentStatus: nextStatus,
      };
    });
  }

  /**
   * 상태 전이에 따라 shipment / driver / routePlan 에 적용할 부수효과를 계산한다.
   * 반환값은 shipment.update 의 data로 병합된다.
   */
  private async buildSideEffects(props: {
    tx: Prisma.TransactionClient;
    shipmentId: number;
    event: ShipmentEventInput;
    nextStatus: ShipmentStatus;
    currentHubId: number | null;
    originHubId: number;
    destinationHubId: number;
    routePlanId?: number;
    routeHops: string[];
    currentHopIndex: number;
  }): Promise<Prisma.ShipmentUpdateInput> {
    const {
      tx,
      shipmentId,
      event,
      nextStatus,
      currentHubId,
      originHubId,
      destinationHubId,
      routePlanId,
      routeHops,
      currentHopIndex,
    } = props;

    const patch: Prisma.ShipmentUpdateInput = {};

    switch (event.type) {
      case 'ASSIGN_PICKUP_DRIVER': {
        await this.assignDriver(tx, { shipmentId, driverId: event.driverId, purpose: 'PICKUP' });
        break;
      }
      case 'ARRIVE_AT_ORIGIN_HUB': {
        patch.currentHub = { connect: { id: originHubId } };
        await this.releaseActiveAssignment(tx, shipmentId, 'PICKUP');
        break;
      }
      case 'DISPATCH_LINE_HAUL': {
        patch.currentHub = { disconnect: true };
        break;
      }
      case 'ARRIVE_AT_HUB': {
        if (!routePlanId) throw new AppException(SHIPMENT_ERRORS.ROUTE_NOT_PLANNED);
        const nextHopIndex = currentHopIndex + 1;
        await tx.routePlan.update({ where: { id: routePlanId }, data: { currentHopIndex: nextHopIndex } });
        const hopCode = routeHops[nextHopIndex];
        if (hopCode) {
          const hub = await tx.warehouse.findUnique({ where: { code: hopCode }, select: { id: true } });
          if (hub) patch.currentHub = { connect: { id: hub.id } };
        }
        break;
      }
      case 'DISPATCH_LAST_MILE': {
        await this.assignDriver(tx, { shipmentId, driverId: event.driverId, purpose: 'LAST_MILE' });
        break;
      }
      case 'DELIVER': {
        patch.currentHub = { connect: { id: destinationHubId } };
        patch.deliveryProof = event.proofUrl;
        await this.releaseActiveAssignment(tx, shipmentId, 'LAST_MILE');
        break;
      }
      case 'FAIL_DELIVERY': {
        patch.failureReason = event.reason;
        break;
      }
      case 'CANCEL': {
        await this.releaseActiveAssignment(tx, shipmentId);
        break;
      }
      default:
        if (nextStatus === ShipmentStatus.CANCELLED && currentHubId !== null) {
          patch.currentHub = { disconnect: true };
        }
        break;
    }

    return patch;
  }

  private async assignDriver(
    tx: Prisma.TransactionClient,
    params: { shipmentId: number; driverId: number; purpose: 'PICKUP' | 'LAST_MILE' | 'LINE_HAUL' },
  ): Promise<void> {
    const driver = await tx.driver.findUnique({ where: { id: params.driverId }, select: { status: true } });
    if (!driver || driver.status !== DriverStatus.AVAILABLE) {
      throw new AppException(SHIPMENT_ERRORS.DRIVER_NOT_AVAILABLE);
    }

    await tx.driverAssignment.create({
      data: { shipmentId: params.shipmentId, driverId: params.driverId, purpose: params.purpose },
    });
    await tx.driver.update({ where: { id: params.driverId }, data: { status: DriverStatus.BUSY } });
  }

  private async releaseActiveAssignment(
    tx: Prisma.TransactionClient,
    shipmentId: number,
    purpose?: 'PICKUP' | 'LAST_MILE' | 'LINE_HAUL',
  ): Promise<void> {
    const where: Prisma.DriverAssignmentWhereInput = { shipmentId, status: 'ACTIVE' };
    if (purpose) where.purpose = purpose;
    const active = await tx.driverAssignment.findMany({ where, select: { id: true, driverId: true } });
    if (active.length === 0) return;

    await tx.driverAssignment.updateMany({
      where: { id: { in: active.map((a) => a.id) } },
      data: { status: 'COMPLETED', releasedAt: new Date() },
    });
    await tx.driver.updateMany({
      where: { id: { in: active.map((a) => a.driverId) } },
      data: { status: DriverStatus.AVAILABLE },
    });
  }
}

interface TransitionShipmentCommandProps {
  shipmentId: number;
  event: ShipmentEventInput;
  actorType: ActorType;
  actorId?: string;
}
