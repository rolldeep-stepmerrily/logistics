import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kafka, Producer, ProducerRecord } from 'kafkajs';

@Injectable()
export class KafkaProducerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KafkaProducerService.name);
  private producer!: Producer;

  constructor(private readonly configService: ConfigService) {}

  /**
   * 모듈 초기화 시 Kafka Producer 연결
   */
  async onModuleInit(): Promise<void> {
    const kafka = new Kafka({
      clientId: this.configService.getOrThrow<string>('KAFKA_CLIENT_ID'),
      brokers: this.configService.getOrThrow<string>('KAFKA_BROKERS').split(','),
    });

    this.producer = kafka.producer({
      idempotent: true,
      maxInFlightRequests: 1,
    });
    await this.producer.connect();
    this.logger.log('Kafka Producer connected');
  }

  /**
   * 모듈 종료 시 Kafka Producer 연결 종료
   */
  async onModuleDestroy(): Promise<void> {
    await this.producer.disconnect();
  }

  /**
   * Kafka 토픽에 메시지 발행
   *
   * @param {ProducerRecord} record 발행할 레코드 (topic + messages)
   */
  async send(record: ProducerRecord): Promise<void> {
    await this.producer.send({ acks: -1, ...record });
  }

  /**
   * 단일 토픽에 단일 JSON 메시지 발행
   *
   * @param {string} topic 토픽 이름
   * @param {unknown} value 발행할 데이터 (JSON 직렬화됨)
   * @param {string} [key] 메시지 키 (파티션 라우팅용)
   */
  async sendMessage(topic: string, value: unknown, key?: string): Promise<void> {
    await this.producer.send({
      topic,
      acks: -1,
      messages: [
        {
          key,
          value: JSON.stringify(value),
        },
      ],
    });
  }
}
