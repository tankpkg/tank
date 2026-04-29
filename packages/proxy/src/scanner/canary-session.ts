import { mintCanary } from './canary.ts';

export interface CanaryLeak {
  canary: string;
  source: string;
}

export interface CanarySessionOptions {
  maxEntries?: number;
  ttlMs?: number;
}

interface CanaryRecord {
  source: string;
  mintedAt: number;
}

const DEFAULT_MAX_ENTRIES = 100_000;
const DEFAULT_TTL_MS = 60 * 60 * 1000;

export class CanarySession {
  private readonly records = new Map<string, CanaryRecord>();
  private readonly maxEntries: number;
  private readonly ttlMs: number;

  constructor(options: CanarySessionOptions = {}) {
    this.maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
    this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  }

  mint(toolName: string): string {
    this.evictExpired();
    const canary = mintCanary();
    this.records.set(canary, { source: toolName, mintedAt: Date.now() });
    this.evictIfOverCap();
    return canary;
  }

  sourceOf(canary: string): string | undefined {
    this.evictExpired();
    return this.records.get(canary)?.source;
  }

  size(): number {
    this.evictExpired();
    return this.records.size;
  }

  scanResponse(toolName: string, text: string): CanaryLeak[] {
    if (text.length === 0) return [];
    this.evictExpired();
    const leaks: CanaryLeak[] = [];
    for (const [canary, record] of this.records) {
      if (record.source === toolName) continue;
      if (text.includes(canary)) leaks.push({ canary, source: record.source });
    }
    return leaks;
  }

  private evictExpired(): void {
    const cutoff = Date.now() - this.ttlMs;
    for (const [canary, record] of this.records) {
      if (record.mintedAt < cutoff) this.records.delete(canary);
    }
  }

  private evictIfOverCap(): void {
    while (this.records.size > this.maxEntries) {
      const oldestKey = this.records.keys().next().value;
      if (oldestKey === undefined) break;
      this.records.delete(oldestKey);
    }
  }
}
