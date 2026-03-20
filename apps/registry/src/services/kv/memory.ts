import type { KVStore } from './store';

interface Entry {
  value: string;
  expiresAt: number;
}

export function createMemoryStore(): KVStore {
  const data = new Map<string, Entry>();

  function getValid(key: string): Entry | null {
    const entry = data.get(key);
    if (!entry) return null;
    if (Date.now() >= entry.expiresAt) {
      data.delete(key);
      return null;
    }
    return entry;
  }

  return {
    async get(key) {
      return getValid(key)?.value ?? null;
    },

    async set(key, value, ttlMs) {
      data.set(key, { value, expiresAt: Date.now() + ttlMs });
    },

    async del(key) {
      data.delete(key);
    },

    async incr(key, ttlMs) {
      const entry = getValid(key);
      if (!entry) {
        data.set(key, { value: '1', expiresAt: Date.now() + ttlMs });
        return 1;
      }
      const next = Number.parseInt(entry.value, 10) + 1;
      entry.value = String(next);
      return next;
    }
  };
}
