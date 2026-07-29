import { PrismaService } from '@@db';
import { AppException } from '@@exceptions';
import { OUTBOX_EVENT_TYPES } from '@@outbox';
import { ActorType, DeliveryPhase, DriverStatus, PaymentStatus, Prisma, ShipmentStatus } from '@@prisma';
import {
  runTransition,
  type ShipmentDeliveryPhase,
  type ShipmentDeliveryState,
  type ShipmentEventInput,
  type ShipmentPaymentState,
} from '@@state-machines';
import { Command, CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { isDefined } from 'class-validator';

import { SHIPMENT_ERRORS } from '../../shipment.error';

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
   * Shipment 상태 전이의 유일한 통로. Parallel machine 이므로 delivery / payment 두 서브머신 중 어느 쪽이든 바뀌면 전이 성공
   *
   * @param {TransitionShipmentCommand} command 전이 커맨드
   * @returns {Promise<TransitionShipmentResult>} 전이 결과 요약
   */
  async execute(command: TransitionShipmentCommand): Promise<TransitionShipmentResult> {
    const { shipmentId, actorType, actorId } = command.props;
    const event = command.props.event;

    return await this.prisma.$transaction(async (tx) => {
      const shipment = await tx.shipment.findUnique({
        where: { id: shipmentId },
        include: { routePlan: true, assignments: { where: { status: 'ACTIVE' } } },
      });

      if (!isDefined(shipment)) {
        throw new AppException(SHIPMENT_ERRORS.NOT_FOUND);
      }

      const context = {
        driverId: shipment.assignments.at(0)?.driverId ?? null,
        currentHopIndex: shipment.routePlan?.currentHopIndex ?? 0,
        totalHops: (shipment.routePlan?.hops as string[] | undefined)?.length ?? 1,
        failureCount: 0,
        maxRetries: 2,
        paidAmount: shipment.paidAmount ?? null,
        deliveryStartedAt: shipment.deliveryStartedAt ?? null,
        arrivedAtDoorAt: shipment.arrivedAtDoorAt ?? null,
      };

      const result = runTransition({
        currentDelivery: shipment.status as ShipmentDeliveryState,
        currentPayment: shipment.paymentStatus as ShipmentPaymentState,
        currentDeliveryPhase: (shipment.deliveryPhase as ShipmentDeliveryPhase | null) ?? null,
        context,
        event,
      });

      if (!result.changed) {
        throw new AppException(SHIPMENT_ERRORS.INVALID_TRANSITION);
      }

      const nextDelivery = result.nextDelivery as ShipmentStatus;
      const nextPayment = result.nextPayment as PaymentStatus;
      const nextDeliveryPhase = (result.nextDeliveryPhase as DeliveryPhase | null) ?? null;

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
          // Entry/exit actions 이 갱신한 context 를 그대로 DB 에 persist
          deliveryPhase: nextDeliveryPhase,
          deliveryStartedAt: result.context.deliveryStartedAt,
          arrivedAtDoorAt: result.context.arrivedAtDoorAt,
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
            fromDeliveryPhase: shipment.deliveryPhase,
            toDeliveryPhase: nextDeliveryPhase,
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
        previousDeliveryPhase: shipment.deliveryPhase,
        currentDeliveryPhase: nextDeliveryPhase,
      };
    });
  }

  /**
   * 상태 전이에 따라 shipment / driver / routePlan 에 적용할 부수효과 계산. 반환값은 shipment.update 의 data 로 병합됨
   *
   * @param {BuildSideEffectsProps} props 부수효과 계산 파라미터
   * @returns {Promise<Prisma.ShipmentUpdateInput>} shipment 업데이트 patch
   */
  private async buildSideEffects(props: BuildSideEffectsProps): Promise<Prisma.ShipmentUpdateInput> {
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
        if (!isDefined(routePlanId)) {
          throw new AppException(SHIPMENT_ERRORS.ROUTE_NOT_PLANNED);
        }

        const nextHopIndex = currentHopIndex + 1;
        await tx.routePlan.update({ where: { id: routePlanId }, data: { currentHopIndex: nextHopIndex } });
        const hopCode = routeHops[nextHopIndex];

        if (isDefined(hopCode)) {
          const hub = await tx.warehouse.findUnique({ where: { code: hopCode }, select: { id: true } });

          if (isDefined(hub)) {
            patch.currentHub = { connect: { id: hub.id } };
          }
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
      case 'TIMEOUT_DELIVERY': {
        // Cron 이 dispatch — 문 앞에서 15분 응답 없이 만료된 경우
        patch.failureReason = 'NO_RESPONSE_TIMEOUT';
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

  /**
   * driver 를 shipment 에 배정하고 driver 상태를 BUSY 로 전이
   *
   * @param {Prisma.TransactionClient} tx 트랜잭션 클라이언트
   * @param {AssignDriverParams} params 배정 파라미터
   */
  private async assignDriver(tx: Prisma.TransactionClient, params: AssignDriverParams): Promise<void> {
    const driver = await tx.driver.findUnique({ where: { id: params.driverId }, select: { status: true } });

    if (!isDefined(driver) || driver.status !== DriverStatus.AVAILABLE) {
      throw new AppException(SHIPMENT_ERRORS.DRIVER_NOT_AVAILABLE);
    }

    await tx.driverAssignment.create({
      data: { shipmentId: params.shipmentId, driverId: params.driverId, purpose: params.purpose },
    });
    await tx.driver.update({ where: { id: params.driverId }, data: { status: DriverStatus.BUSY } });
  }

  /**
   * 활성 배정을 종료하고 driver 상태를 AVAILABLE 로 복귀
   *
   * @param {Prisma.TransactionClient} tx 트랜잭션 클라이언트
   * @param {number} shipmentId 대상 송장 ID
   * @param {'PICKUP' | 'LAST_MILE' | 'LINE_HAUL'} [purpose] 종료할 배정 목적
   */
  private async releaseActiveAssignment(
    tx: Prisma.TransactionClient,
    shipmentId: number,
    purpose?: 'PICKUP' | 'LAST_MILE' | 'LINE_HAUL',
  ): Promise<void> {
    const where: Prisma.DriverAssignmentWhereInput = { shipmentId, status: 'ACTIVE' };

    if (isDefined(purpose)) {
      where.purpose = purpose;
    }

    const active = await tx.driverAssignment.findMany({ where, select: { id: true, driverId: true } });

    if (active.length === 0) {
      return;
    }

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

interface TransitionShipmentResult {
  id: number;
  previousStatus: ShipmentStatus;
  currentStatus: ShipmentStatus;
  previousPaymentStatus: PaymentStatus;
  currentPaymentStatus: PaymentStatus;
  previousDeliveryPhase: DeliveryPhase | null;
  currentDeliveryPhase: DeliveryPhase | null;
}

interface TransitionShipmentCommandProps {
  shipmentId: number;
  event: ShipmentEventInput;
  actorType: ActorType;
  actorId?: string;
}

interface BuildSideEffectsProps {
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
}

interface AssignDriverParams {
  shipmentId: number;
  driverId: number;
  purpose: 'PICKUP' | 'LAST_MILE' | 'LINE_HAUL';
}
