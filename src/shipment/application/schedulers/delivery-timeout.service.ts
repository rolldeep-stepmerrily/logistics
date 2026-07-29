import { TypedCommandBus } from '@@cqrs';
import { PrismaService } from '@@db';
import { ActorType, ShipmentStatus } from '@@prisma';
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { TransitionShipmentCommand } from '../commands/transition-shipment.command';

const AT_DOOR_TIMEOUT_MS = 15 * 60 * 1000;
const BATCH_SIZE = 50;

/**
 * XState `after` 를 프로덕션 환경에서 구현하는 스캐너.
 *
 * shipmentMachine 의 OUT_FOR_DELIVERY.AT_DOOR 는 `after: { 900000: '#deliveryFailed' }` 를 선언하지만,
 * runTransition 은 매 요청마다 actor 를 create/stop 하므로 timer 가 실제로는 fire 되지 않는다.
 *
 * 이 서비스가 XState 의 delayed transition 의미론을 대신 구현한다:
 *   - 1분마다 폴링
 *   - deliveryPhase=AT_DOOR AND arrivedAtDoorAt < now - 15min 인 shipment 를 찾아
 *   - TIMEOUT_DELIVERY 이벤트를 TransitionShipmentCommand 로 dispatch
 *   - 머신이 정상 전이 (OUT_FOR_DELIVERY → DELIVERY_FAILED) + 부수효과 처리
 *
 * 원자성 / idempotency:
 *   - Transition 은 트랜잭션 안에서 phase 를 다른 상태로 옮기므로 다음 tick 에서 다시 잡히지 않음
 *   - 만에 하나 concurrent 실행으로 중복 dispatch 되어도 INVALID_TRANSITION 예외로 안전하게 실패
 */
@Injectable()
export class DeliveryTimeoutService {
  private readonly logger = new Logger(DeliveryTimeoutService.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly commandBus: TypedCommandBus<TransitionShipmentCommand>,
  ) {}

  /**
   * AT_DOOR 상태로 15분 이상 응답 없는 송장을 찾아 TIMEOUT_DELIVERY 이벤트 dispatch
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async scanExpiredAtDoor(): Promise<void> {
    if (this.running) {
      return;
    }

    this.running = true;

    try {
      const threshold = new Date(Date.now() - AT_DOOR_TIMEOUT_MS);
      const expired = await this.prisma.shipment.findMany({
        where: {
          status: ShipmentStatus.OUT_FOR_DELIVERY,
          deliveryPhase: 'AT_DOOR',
          arrivedAtDoorAt: { lt: threshold },
        },
        select: { id: true, arrivedAtDoorAt: true },
        take: BATCH_SIZE,
      });

      if (expired.length === 0) {
        return;
      }

      for (const shipment of expired) {
        try {
          await this.commandBus.execute(
            new TransitionShipmentCommand({
              shipmentId: shipment.id,
              event: { type: 'TIMEOUT_DELIVERY' },
              actorType: ActorType.SYSTEM,
              actorId: 'delivery-timeout-scheduler',
            }),
          );
          this.logger.log(
            `Dispatched TIMEOUT_DELIVERY for shipmentId=${shipment.id} (at_door since ${shipment.arrivedAtDoorAt?.toISOString()})`,
          );
        } catch (err) {
          this.logger.error(
            `Failed to dispatch TIMEOUT_DELIVERY for shipmentId=${shipment.id}: ${(err as Error).message}`,
          );
        }
      }
    } catch (err) {
      this.logger.error(`Delivery timeout scan tick failed: ${(err as Error).message}`);
    } finally {
      this.running = false;
    }
  }
}
