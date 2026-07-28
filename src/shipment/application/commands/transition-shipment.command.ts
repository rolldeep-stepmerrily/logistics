import { PrismaService } from '@@db';
import { AppException } from '@@exceptions';
import { OUTBOX_EVENT_TYPES } from '@@outbox';
import { ActorType, DriverStatus, PaymentStatus, Prisma, ShipmentStatus } from '@@prisma';
import {
  runTransition,
  type ShipmentDeliveryState,
  type ShipmentEventInput,
  type ShipmentPaymentState,
} from '@@state-machines';
import { Command, CommandHandler, ICommandHandler } from '@nestjs/cqrs';

import { SHIPMENT_ERRORS } from '../../shipment.error';

interface TransitionShipmentResult {
  id: number;
  previousStatus: ShipmentStatus;
  currentStatus: ShipmentStatus;
  previousPaymentStatus: PaymentStatus;
  currentPaymentStatus: PaymentStatus;
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
   * Parallel machine 이므로 delivery / payment 두 서브머신 중 어느 쪽이든 바뀌면 전이 성공.
   *
   * 절차:
   *   1) 현재 shipment 로드 (delivery + payment + routePlan + driver assignments 포함)
   *   2) XState machine 에 이벤트 던져서 다음 상태 계산 (guard 실패 시 same-state 반환)
   *   3) 둘 다 안 바뀌면 INVALID_TRANSITION 예외
   *   4) 트랜잭션 안에서 status / paymentStatus 업데이트 + shipmentEvent 로그 + outbox event + 부수효과
   *
   * 부수효과 (같은 트랜잭션 안):
   *   - MARK_PICKED_UP → driver 상태를 BUSY로 유지, currentHub null 처리
   *   - ARRIVE_AT_ORIGIN_HUB → currentHub = originHub, pickup 담당 driver 할당 종료 + AVAILABLE
   *   - DISPATCH_LINE_HAUL → currentHub null (허브 사이)
   *   - ARRIVE_AT_HUB → currentHub = routePlan.hops[nextIndex]
   *   - DELIVER → currentHub = destinationHub, last-mile driver 할당 종료 + AVAILABLE, deliveryProof 저장
   *   - FAIL_DELIVERY → failureReason 저장
   *   - CONFIRM_PAYMENT → paidAmount 저장
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
        paidAmount: shipment.paidAmount ?? null,
      };

      const result = runTransition({
        currentDelivery: shipment.status as ShipmentDeliveryState,
        currentPayment: shipment.paymentStatus as ShipmentPaymentState,
        context,
        event,
      });

      if (!result.changed) {
        throw new AppException(SHIPMENT_ERRORS.INVALID_TRANSITION);
      }

      const nextDelivery = result.nextDelivery as ShipmentStatus;
      const nextPayment = result.nextPayment as PaymentStatus;

      const patch = await this.buildSideEffects({
        tx,
        shipmentId,
        event,
        nextDelivery,
        currentHubId: shipment.currentHubId,
        originHubId: shipment.originHubId,
        destinationHubId: shipment.destinationHubId,
        routePlanId: shipment.routePlan?.id,
        routeHops: (shipment.routePlan?.hops as string[] | undefined) ?? [],
        currentHopIndex: shipment.routePlan?.currentHopIndex ?? 0,
      });

      await tx.shipment.update({
        where: { id: shipmentId },
        data: {
          status: nextDelivery,
          paymentStatus: nextPayment,
          paidAmount: result.context.paidAmount,
          ...patch,
        },
      });

      await tx.shipmentEvent.create({
        data: {
          shipmentId,
          fromStatus: shipment.status,
          toStatus: nextDelivery,
          eventType: event.type,
          payload: event as Prisma.InputJsonValue,
          actorType,
          actorId,
        },
      });

      await tx.outboxEvent.create({
        data: {
          aggregateId: String(shipmentId),
          eventType: OUTBOX_EVENT_TYPES.SHIPMENT_TRANSITIONED,
          payload: {
            shipmentId,
            fromStatus: shipment.status,
            toStatus: nextDelivery,
            fromPaymentStatus: shipment.paymentStatus,
            toPaymentStatus: nextPayment,
            eventType: event.type,
            occurredAt: new Date().toISOString(),
          },
        },
      });

      return {
        id: shipmentId,
        previousStatus: shipment.status,
        currentStatus: nextDelivery,
        previousPaymentStatus: shipment.paymentStatus,
        currentPaymentStatus: nextPayment,
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
    nextDelivery: ShipmentStatus;
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
      nextDelivery,
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
        if (nextDelivery === ShipmentStatus.CANCELLED && currentHubId !== null) {
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
