import Redis from 'ioredis';

import { env } from '~/consts/env';

let redis: Redis | null = null;

export function getRedis(): Redis | null {
  if (!redis && env.REDIS_URL) {
    redis = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      lazyConnect: true
    });
  }
  return redis;
}

export { redis };
