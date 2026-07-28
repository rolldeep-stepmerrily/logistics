import { PrismaService } from '@@db';
import { KafkaProducerService } from '@@kafka';
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { OUTBOX_TOPIC_MAPPING } from './outbox.constants';

const BATCH_SIZE = 50;

@Injectable()
export class OutboxPublisherService {
  private readonly logger = new Logger(OutboxPublisherService.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly kafka: KafkaProducerService,
  ) {}

  /**
   * 5초마다 발행 안 된 outbox_events 를 배치로 처리한다.
   *
   * 실행 원리:
   *   1) publishedAt IS NULL 인 row 를 오래된 순으로 BATCH_SIZE 개 로드
   *   2) 각각 Kafka 토픽에 발행 (eventType → topic 매핑)
   *   3) 발행 성공한 row 에만 publishedAt 을 set
   *
   * 실패 시 publishedAt 이 null 로 남아 다음 tick 에서 재시도된다. 최소 1회 이상 발행 보장 (at-least-once).
   */
  @Cron(CronExpression.EVERY_5_SECONDS)
  async publishPending(): Promise<void> {
    if (this.running) return;
    this.running = true;

    try {
      const pending = await this.prisma.outboxEvent.findMany({
        where: { publishedAt: null },
        orderBy: { id: 'asc' },
        take: BATCH_SIZE,
      });

      if (pending.length === 0) return;

      const publishedIds: number[] = [];
      for (const event of pending) {
        const topic = OUTBOX_TOPIC_MAPPING[event.eventType];
        if (!topic) {
          this.logger.warn(`No topic mapping for eventType=${event.eventType}, skipping id=${event.id}`);
          continue;
        }

        try {
          await this.kafka.sendMessage(topic, event.payload, event.aggregateId);
          publishedIds.push(event.id);
        } catch (err) {
          this.logger.error(
            `Failed to publish outbox event id=${event.id} type=${event.eventType}: ${(err as Error).message}`,
          );
        }
      }

      if (publishedIds.length > 0) {
        await this.prisma.outboxEvent.updateMany({
          where: { id: { in: publishedIds } },
          data: { publishedAt: new Date() },
        });
        this.logger.log(`Published ${publishedIds.length}/${pending.length} outbox events`);
      }
    } catch (err) {
      this.logger.error(`Outbox publish tick failed: ${(err as Error).message}`);
    } finally {
      this.running = false;
    }
  }
}
