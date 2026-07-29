import { PrismaService } from '@@db';
import { KafkaProducerService } from '@@kafka';
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { isDefined } from 'class-validator';

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
   * 5초마다 미발행 outbox_events 를 배치 처리. at-least-once 보장 (실패 시 publishedAt null 유지)
   */
  @Cron(CronExpression.EVERY_5_SECONDS)
  async publishPending(): Promise<void> {
    if (this.running) {
      return;
    }

    this.running = true;

    try {
      const pending = await this.prisma.outboxEvent.findMany({
        where: { publishedAt: null },
        orderBy: { id: 'asc' },
        take: BATCH_SIZE,
      });

      if (pending.length === 0) {
        return;
      }

      const publishedIds = await this.publishBatch(pending);

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

  /**
   * pending 이벤트 배열을 순회하며 각각을 Kafka 로 발행. 성공한 이벤트 ID 목록 반환
   *
   * @param {OutboxEventLike[]} pending 발행 대상 이벤트 배열
   * @returns {Promise<number[]>} 발행 성공한 이벤트 ID 목록
   */
  private async publishBatch(pending: OutboxEventLike[]): Promise<number[]> {
    const publishedIds: number[] = [];

    for (const event of pending) {
      const topic = OUTBOX_TOPIC_MAPPING[event.eventType];

      if (!isDefined(topic)) {
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

    return publishedIds;
  }
}

interface OutboxEventLike {
  id: number;
  eventType: string;
  aggregateId: string;
  payload: unknown;
}
