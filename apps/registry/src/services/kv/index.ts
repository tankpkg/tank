import { env } from '~/consts/env';

import { createMemoryStore } from './memory';
import { createPostgresStore } from './postgres';
import { createRedisStore } from './redis';
import type { KVStore } from './store';

export type { KVStore } from './store';

let instance: KVStore | null = null;

export function getKVStore(): KVStore {
  if (!instance) {
    if (env.REDIS_URL) {
      instance = createRedisStore(env.REDIS_URL);
    } else if (env.DATABASE_URL) {
      instance = createPostgresStore(env.DATABASE_URL);
    } else {
      instance = createMemoryStore();
    }
  }
  return instance;
}
