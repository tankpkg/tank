export interface KVStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlMs: number): Promise<void>;
  del(key: string): Promise<void>;
  incr(key: string, ttlMs: number): Promise<number>;
}
