import { Injectable } from '@nestjs/common';
import type { ThrottlerStorage } from '@nestjs/throttler';

import { RedisService } from './redis.service';

interface ThrottlerStorageRecord {
  totalHits: number;
  timeToExpire: number;
  isBlocked: boolean;
  timeToBlockExpire: number;
}

@Injectable()
export class RedisThrottlerStorage implements ThrottlerStorage {
  constructor(private readonly redisService: RedisService) {}

  /**
   * 요청 횟수를 증가시키고 throttle 상태를 반환
   *
   * @param {string} key 식별 키
   * @param {number} ttl 윈도우 만료 시간 (ms)
   * @param {number} limit 윈도우 내 최대 허용 횟수
   * @param {number} blockDuration 차단 지속 시간 (ms)
   * @param {string} throttlerName throttler 이름
   * @returns {Promise<ThrottlerStorageRecord>} throttle 상태
   */
  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const hitKey = `throttle:${throttlerName}:${key}`;
    const blockKey = `throttle:block:${throttlerName}:${key}`;
    const client = this.redisService.getClient();

    const blockedRecord = await this.buildBlockedRecordIfActive(client, blockKey, limit);

    if (blockedRecord !== null) {
      return blockedRecord;
    }

    return await this.incrementHitAndMaybeBlock(client, hitKey, blockKey, ttl, limit, blockDuration);
  }

  /**
   * block 키가 존재하면 즉시 차단 응답을 만든다. 없으면 null 반환
   *
   * @param {ReturnType<RedisService['getClient']>} client Redis 클라이언트
   * @param {string} blockKey 차단 키
   * @param {number} limit 요청 한도
   * @returns {Promise<ThrottlerStorageRecord | null>} 차단 상태 또는 null
   */
  private async buildBlockedRecordIfActive(
    client: ReturnType<RedisService['getClient']>,
    blockKey: string,
    limit: number,
  ): Promise<ThrottlerStorageRecord | null> {
    const isBlocked = (await client.exists(blockKey)) === 1;

    if (!isBlocked) {
      return null;
    }

    const blockPttl = await client.pttl(blockKey);

    return {
      totalHits: limit + 1,
      timeToExpire: 0,
      isBlocked: true,
      timeToBlockExpire: Math.max(0, blockPttl),
    };
  }

  /**
   * hit 카운터를 증가시키고 limit 초과 시 block 키 설정 후 결과 반환
   *
   * @param {ReturnType<RedisService['getClient']>} client Redis 클라이언트
   * @param {string} hitKey 카운터 키
   * @param {string} blockKey 차단 키
   * @param {number} ttl 윈도우 만료 시간 (ms)
   * @param {number} limit 요청 한도
   * @param {number} blockDuration 차단 지속 시간 (ms)
   * @returns {Promise<ThrottlerStorageRecord>} throttle 상태
   */
  private async incrementHitAndMaybeBlock(
    client: ReturnType<RedisService['getClient']>,
    hitKey: string,
    blockKey: string,
    ttl: number,
    limit: number,
    blockDuration: number,
  ): Promise<ThrottlerStorageRecord> {
    const totalHits = await client.incr(hitKey);

    if (totalHits === 1) {
      await client.pexpire(hitKey, ttl);
    }

    const timeToExpire = Math.max(0, await client.pttl(hitKey));

    if (totalHits > limit && blockDuration > 0) {
      await client.set(blockKey, '1', 'PX', blockDuration);
      const blockPttl = Math.max(0, await client.pttl(blockKey));

      return { totalHits, timeToExpire, isBlocked: true, timeToBlockExpire: blockPttl };
    }

    return { totalHits, timeToExpire, isBlocked: false, timeToBlockExpire: 0 };
  }
}
