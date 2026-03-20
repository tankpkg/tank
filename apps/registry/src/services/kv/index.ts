import { env } from '~/consts/env';

import { createMemoryStore } from './memory';
import { createRedisStore } from './redis';
import type { KVStore } from './store';

export type { KVStore } from './store';

let instance: KVStore | null = null;

export function getKVStore(): KVStore {
  if (!instance) {
    instance = env.REDIS_URL ? createRedisStore(env.REDIS_URL) : createMemoryStore();
  }
  return instance;
}
