import { createHash } from 'node:crypto';
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isDefined } from 'class-validator';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private client!: Redis;

  private readonly releaseLockScript = `
    if redis.call('GET', KEYS[1]) == ARGV[1] then
      return redis.call('DEL', KEYS[1])
    else
      return 0
    end
  `;

  private readonly decrementStockScript = `
    local stock = redis.call('GET', KEYS[1])
    if stock == false then
      return -1
    end
    if tonumber(stock) <= 0 then
      return 0
    end
    redis.call('DECR', KEYS[1])
    return 1
  `;

  constructor(private readonly configService: ConfigService) {}

  /**
   * 모듈 초기화 시 Redis 클라이언트를 생성
   */
  onModuleInit(): void {
    const password = this.configService.get<string>('REDIS_PASSWORD');

    this.client = new Redis({
      host: this.configService.getOrThrow<string>('REDIS_HOST'),
      port: this.configService.getOrThrow<number>('REDIS_PORT'),
      ...(isDefined(password) && { password }),
      lazyConnect: true,
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit();
  }

  /**
   * Redis 클라이언트 반환
   *
   * @returns {Redis} ioredis 클라이언트
   */
  getClient(): Redis {
    return this.client;
  }

  /**
   * Access token을 블랙리스트에 추가
   *
   * @param {string} token Access token
   * @param {number} ttlSeconds 만료까지 남은 초
   */
  async addToBlacklist(token: string, ttlSeconds: number): Promise<void> {
    if (ttlSeconds <= 0) {
      return;
    }

    await this.client.set(this.buildBlacklistKey(token), '1', 'EX', ttlSeconds);
  }

  /**
   * Access token이 블랙리스트에 있는지 확인
   *
   * @param {string} token Access token
   * @returns {Promise<boolean>} 블랙리스트 여부
   */
  async isBlacklisted(token: string): Promise<boolean> {
    const result = await this.client.exists(this.buildBlacklistKey(token));

    return result === 1;
  }

  /**
   * 분산 락 획득 (SET NX EX)
   *
   * @param {string} key 락 키
   * @param {string} value 락 값 (소유자 식별용)
   * @param {number} ttlSeconds 만료 시간 (초)
   * @returns {Promise<boolean>} 락 획득 성공 여부
   */
  async acquireLock(key: string, value: string, ttlSeconds: number): Promise<boolean> {
    const result = await this.client.set(key, value, 'EX', ttlSeconds, 'NX');
    return result === 'OK';
  }

  /**
   * 분산 락 해제 (Lua script - 소유자 검증 후 삭제)
   *
   * @param {string} key 락 키
   * @param {string} value 락 획득 시 사용한 값
   * @returns {Promise<boolean>} 락 해제 성공 여부
   */
  async releaseLock(key: string, value: string): Promise<boolean> {
    const result = (await this.client.eval(this.releaseLockScript, 1, key, value)) as number;
    return result === 1;
  }

  /**
   * 좌석 재고 원자적 감소 (Lua script)
   *
   * @param {string} key 재고 키
   * @returns {Promise<number>} 1: 성공, 0: 재고 없음, -1: 키 미초기화
   */
  async decrementStock(key: string): Promise<number> {
    return (await this.client.eval(this.decrementStockScript, 1, key)) as number;
  }

  /**
   * 좌석 재고 증가 (예매 취소 시 보상)
   *
   * @param {string} key 재고 키
   * @returns {Promise<number>} 증가 후 값
   */
  async incrementStock(key: string): Promise<number> {
    return await this.client.incr(key);
  }

  /**
   * 좌석 재고 초기화 (공연 등록 시 사전 세팅)
   *
   * @param {string} key 재고 키
   * @param {number} stock 초기 재고 값
   */
  async setStock(key: string, stock: number): Promise<void> {
    await this.client.set(key, String(stock));
  }

  /**
   * 여러 좌석 재고를 atomic 하게 초기화 (MULTI 트랜잭션)
   * 하나라도 실패하면 전체 실패로 처리.
   *
   * @param {Array<{ key: string; stock: number }>} entries 초기화할 키/값 쌍
   */
  async setStocksAtomic(entries: { key: string; stock: number }[]): Promise<void> {
    if (entries.length === 0) {
      return;
    }

    const pipeline = this.client.multi();
    for (const entry of entries) {
      pipeline.set(entry.key, String(entry.stock));
    }

    const results = await pipeline.exec();

    if (!isDefined(results)) {
      throw new Error('Redis pipeline returned no results');
    }

    for (const [err] of results) {
      if (isDefined(err)) {
        throw err;
      }
    }
  }

  /**
   * 여러 키 삭제 (best-effort 보상 정리용)
   *
   * @param {string[]} keys 삭제할 키 목록
   */
  async deleteKeys(keys: string[]): Promise<void> {
    if (keys.length === 0) {
      return;
    }

    await this.client.del(...keys);
  }

  /**
   * 블랙리스트 키 생성 (SHA-256 해시로 메모리/보안 개선)
   *
   * @param {string} token 원본 토큰
   * @returns {string} 블랙리스트 키
   */
  private buildBlacklistKey(token: string): string {
    const hash = createHash('sha256').update(token).digest('hex');
    return `blacklist:${hash}`;
  }
}
