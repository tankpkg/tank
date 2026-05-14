/**
 * Pure orchestrator for bulk rescan. Has zero DB / network dependencies so it
 * can be unit-tested in isolation. The DB-aware wrapper lives in
 * ``bulk-rescan-db.ts`` and supplies the real candidate query and rescan fn.
 *
 * Per-call ceilings keep us inside Vercel's serverless function timeout:
 *   limit       ≤ MAX_LIMIT (50)
 *   concurrency ≤ MAX_CONCURRENCY (5)
 *
 * A single rescan currently takes ~5–30s (full scan pipeline + dep audit).
 * With limit=10 and concurrency=3 the worst case is ~100s. For larger
 * backfills the caller paginates by re-issuing the request until
 * ``remaining === 0``.
 */

export const MAX_LIMIT = 50;
export const MAX_CONCURRENCY = 5;
export const DEFAULT_LIMIT = 10;
export const DEFAULT_CONCURRENCY = 3;

export interface BulkRescanFilter {
  status?: readonly string[];
  beforeScannedAt?: Date;
  limit?: number;
  concurrency?: number;
  dryRun?: boolean;
}

export interface BulkRescanCandidate {
  skillId: string;
  skillName: string;
  version: string;
  auditStatus: string | null;
  lastScannedAt: Date | null;
}

export interface BulkRescanResultItem extends BulkRescanCandidate {
  verdict?: string;
  findingsCount?: number;
  error?: string;
}

export interface BulkRescanResult {
  matched: number;
  rescanned: number;
  remaining: number;
  dryRun: boolean;
  results: BulkRescanResultItem[];
}

function clamp(value: number | undefined, fallback: number, max: number): number {
  if (value === undefined || !Number.isFinite(value) || value < 1) return fallback;
  return Math.min(Math.floor(value), max);
}

export type RescanFn = (skillId: string, adminUserId: string) => Promise<{ verdict: string; findingsCount: number }>;

export async function orchestrateBulkRescan({
  candidates,
  rescan,
  adminUserId,
  filter
}: {
  candidates: readonly BulkRescanCandidate[];
  rescan: RescanFn;
  adminUserId: string;
  filter: BulkRescanFilter;
}): Promise<BulkRescanResult> {
  const limit = clamp(filter.limit, DEFAULT_LIMIT, MAX_LIMIT);
  const concurrency = clamp(filter.concurrency, DEFAULT_CONCURRENCY, MAX_CONCURRENCY);
  const dryRun = filter.dryRun === true;

  const slice = candidates.slice(0, limit);

  if (dryRun) {
    return {
      matched: candidates.length,
      rescanned: 0,
      remaining: candidates.length,
      dryRun: true,
      results: slice
    };
  }

  const results: BulkRescanResultItem[] = new Array(slice.length);
  let cursor = 0;

  async function worker(): Promise<void> {
    for (;;) {
      const index = cursor++;
      if (index >= slice.length) return;
      const candidate = slice[index];
      try {
        const scan = await rescan(candidate.skillId, adminUserId);
        results[index] = {
          ...candidate,
          verdict: scan.verdict,
          findingsCount: scan.findingsCount
        };
      } catch (err) {
        results[index] = {
          ...candidate,
          error: (err as Error).message
        };
      }
    }
  }

  const workerCount = Math.min(concurrency, slice.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  return {
    matched: candidates.length,
    rescanned: slice.length,
    remaining: Math.max(0, candidates.length - slice.length),
    dryRun: false,
    results
  };
}
