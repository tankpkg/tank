import type { KVStore } from './store';

interface Entry {
  value: string;
  expiresAt: number;
  expiresMonotonic: number;
}

export function createMemoryStore(): KVStore {
  const data = new Map<string, Entry>();

  function getValid(key: string): Entry | null {
    const entry = data.get(key);
    if (!entry) return null;
    // Wall time accounts for sleep; monotonic time limits backward clock jumps.
    if (Date.now() >= entry.expiresAt || performance.now() >= entry.expiresMonotonic) {
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
      data.set(key, { value, expiresAt: Date.now() + ttlMs, expiresMonotonic: performance.now() + ttlMs });
    },

    async del(key) {
      data.delete(key);
    },

    async compareAndSet(key, expected, value, deadlineMs) {
      const entry = getValid(key);
      if (!entry || entry.value !== expected) return false;
      if (deadlineMs !== undefined && (!Number.isSafeInteger(deadlineMs) || Date.now() >= deadlineMs)) return false;
      entry.value = value;
      return true;
    },

    async compareAndDelete(key, expected, deadlineMs) {
      const entry = getValid(key);
      if (!entry || entry.value !== expected) return false;
      if (deadlineMs !== undefined && (!Number.isSafeInteger(deadlineMs) || Date.now() >= deadlineMs)) return false;
      data.delete(key);
      return true;
    },

    async incr(key, ttlMs) {
      const entry = getValid(key);
      if (!entry) {
        data.set(key, { value: '1', expiresAt: Date.now() + ttlMs, expiresMonotonic: performance.now() + ttlMs });
        return 1;
      }
      const next = Number.parseInt(entry.value, 10) + 1;
      entry.value = String(next);
      return next;
    }
  };
}
