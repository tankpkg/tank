export interface KVStore {
  get(key: string): Promise<string | null>;
  /** Start the TTL on the store's clock, not the caller's wall clock. */
  set(key: string, value: string, ttlMs: number): Promise<void>;
  del(key: string): Promise<void>;
  /** Replace a matching, unexpired value before an optional epoch-ms deadline, preserving its expiry.
   * The deadline uses the store host's clock after any wait. */
  compareAndSet(key: string, expected: string, value: string, deadlineMs?: number): Promise<boolean>;
  /** Delete a matching, unexpired value before an optional epoch-ms deadline. */
  compareAndDelete(key: string, expected: string, deadlineMs?: number): Promise<boolean>;
  incr(key: string, ttlMs: number): Promise<number>;
}
