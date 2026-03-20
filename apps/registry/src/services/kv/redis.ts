import Redis from 'ioredis';

import type { KVStore } from './store';

export function createRedisStore(url: string): KVStore {
  const client = new Redis(url, { maxRetriesPerRequest: 3, lazyConnect: true });
  client.connect().catch(() => {});

  return {
    async get(key) {
      return client.get(key);
    },

    async set(key, value, ttlMs) {
      await client.set(key, value, 'PX', ttlMs);
    },

    async del(key) {
      await client.del(key);
    },

    async incr(key, ttlMs) {
      const val = await client.incr(key);
      if (val === 1) await client.pexpire(key, ttlMs);
      return val;
    }
  };
}
