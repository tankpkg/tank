/**
 * Unit tests for the bulk-rescan orchestrator.
 *
 * The orchestrator is dependency-injected (``rescan`` parameter), so these
 * tests stub the rescan function and feed synthetic candidates. The Drizzle
 * query that builds candidates lives in ``findRescanCandidates`` and is
 * verified by integration tests against a real database.
 */

import { describe, expect, it, vi } from 'vitest';

import {
  type BulkRescanCandidate,
  DEFAULT_CONCURRENCY,
  DEFAULT_LIMIT,
  MAX_CONCURRENCY,
  MAX_LIMIT,
  orchestrateBulkRescan,
  type RescanFn
} from './bulk-rescan';

function makeCandidates(n: number): BulkRescanCandidate[] {
  return Array.from({ length: n }, (_, i) => ({
    skillId: `skill-${i}`,
    skillName: `@org/skill-${i}`,
    version: '1.0.0',
    auditStatus: i % 2 === 0 ? 'failed' : 'flagged',
    lastScannedAt: new Date(`2026-05-01T00:00:${String(i).padStart(2, '0')}Z`)
  }));
}

function passingRescan(): RescanFn {
  return vi.fn(async () => ({ verdict: 'pass', findingsCount: 0 }));
}

describe('orchestrateBulkRescan', () => {
  it('returns zeros when there are no candidates', async () => {
    const result = await orchestrateBulkRescan({
      candidates: [],
      rescan: passingRescan(),
      adminUserId: 'admin-1',
      filter: {}
    });

    expect(result).toEqual({
      matched: 0,
      rescanned: 0,
      remaining: 0,
      dryRun: false,
      results: []
    });
  });

  it('rescans every candidate when the limit exceeds the population', async () => {
    const rescan = passingRescan();
    const result = await orchestrateBulkRescan({
      candidates: makeCandidates(3),
      rescan,
      adminUserId: 'admin-1',
      filter: { limit: 50 }
    });

    expect(result.matched).toBe(3);
    expect(result.rescanned).toBe(3);
    expect(result.remaining).toBe(0);
    expect(result.results).toHaveLength(3);
    expect(result.results.every((r) => r.verdict === 'pass')).toBe(true);
    expect(rescan).toHaveBeenCalledTimes(3);
  });

  it('paginates: limit < matched reports remaining for the next call', async () => {
    const rescan = passingRescan();
    const result = await orchestrateBulkRescan({
      candidates: makeCandidates(7),
      rescan,
      adminUserId: 'admin-1',
      filter: { limit: 3 }
    });

    expect(result.matched).toBe(7);
    expect(result.rescanned).toBe(3);
    expect(result.remaining).toBe(4);
    expect(rescan).toHaveBeenCalledTimes(3);
  });

  it('caps limit at MAX_LIMIT and concurrency at MAX_CONCURRENCY', async () => {
    const rescan = passingRescan();
    const result = await orchestrateBulkRescan({
      candidates: makeCandidates(200),
      rescan,
      adminUserId: 'admin-1',
      filter: { limit: 10_000, concurrency: 10_000 }
    });

    expect(result.rescanned).toBe(MAX_LIMIT);
    expect(rescan).toHaveBeenCalledTimes(MAX_LIMIT);
  });

  it('falls back to DEFAULT_LIMIT / DEFAULT_CONCURRENCY when params are missing or invalid', async () => {
    const rescan = passingRescan();
    const result = await orchestrateBulkRescan({
      candidates: makeCandidates(MAX_LIMIT),
      rescan,
      adminUserId: 'admin-1',
      filter: { limit: 0, concurrency: -5 }
    });

    expect(result.rescanned).toBe(DEFAULT_LIMIT);
    expect(DEFAULT_CONCURRENCY).toBeLessThanOrEqual(MAX_CONCURRENCY);
  });

  it('respects the concurrency cap: never runs more rescans in flight than configured', async () => {
    let inFlight = 0;
    let peak = 0;
    const rescan: RescanFn = vi.fn(async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 10));
      inFlight--;
      return { verdict: 'pass', findingsCount: 0 };
    });

    await orchestrateBulkRescan({
      candidates: makeCandidates(15),
      rescan,
      adminUserId: 'admin-1',
      filter: { limit: 15, concurrency: 3 }
    });

    expect(peak).toBeLessThanOrEqual(3);
    expect(peak).toBeGreaterThan(1);
  });

  it('captures per-candidate failures without aborting the rest', async () => {
    const rescan: RescanFn = vi.fn(async (skillId: string) => {
      if (skillId === 'skill-1') throw new Error('Scanner returned 502: boom');
      return { verdict: 'pass', findingsCount: 0 };
    });

    const result = await orchestrateBulkRescan({
      candidates: makeCandidates(4),
      rescan,
      adminUserId: 'admin-1',
      filter: { limit: 10 }
    });

    expect(result.rescanned).toBe(4);
    const errored = result.results.filter((r) => r.error);
    const passed = result.results.filter((r) => r.verdict === 'pass');
    expect(errored).toHaveLength(1);
    expect(errored[0].skillId).toBe('skill-1');
    expect(errored[0].error).toContain('Scanner returned 502');
    expect(passed).toHaveLength(3);
  });

  it('dryRun returns the candidate slice without calling rescan', async () => {
    const rescan = passingRescan();
    const result = await orchestrateBulkRescan({
      candidates: makeCandidates(5),
      rescan,
      adminUserId: 'admin-1',
      filter: { limit: 3, dryRun: true }
    });

    expect(result.dryRun).toBe(true);
    expect(result.matched).toBe(5);
    expect(result.rescanned).toBe(0);
    expect(result.remaining).toBe(5);
    expect(result.results).toHaveLength(3);
    expect(result.results.every((r) => r.verdict === undefined)).toBe(true);
    expect(rescan).not.toHaveBeenCalled();
  });

  it('preserves candidate ordering in the results array', async () => {
    const rescan = passingRescan();
    const candidates = makeCandidates(5);
    const result = await orchestrateBulkRescan({
      candidates,
      rescan,
      adminUserId: 'admin-1',
      filter: { limit: 5, concurrency: 3 }
    });

    expect(result.results.map((r) => r.skillId)).toEqual(candidates.map((c) => c.skillId));
  });

  it('forwards adminUserId to every rescan call', async () => {
    const rescan: RescanFn = vi.fn(async () => ({ verdict: 'pass', findingsCount: 0 }));
    await orchestrateBulkRescan({
      candidates: makeCandidates(3),
      rescan,
      adminUserId: 'admin-xyz',
      filter: { limit: 5 }
    });

    for (const call of vi.mocked(rescan).mock.calls) {
      expect(call[1]).toBe('admin-xyz');
    }
  });
});
