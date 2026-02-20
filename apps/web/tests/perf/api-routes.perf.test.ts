import { describe, it, expect, beforeAll } from 'vitest';
import { execSync } from 'node:child_process';
import { loadBudgets, writeResults } from './helpers/budgets.js';
import type { ApiRouteResult, PerfResults } from './helpers/budgets.js';
import { p95, measureApiRouteWithWarmup } from './helpers/metrics.js';
import { PERF_BASE_URL, waitForServer } from './helpers/server.js';

const budgets = loadBudgets();

function getGitCommit(): string {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim();
  } catch {
    return 'unknown';
  }
}

describe('P1 API Route Performance (no-cache)', () => {
  beforeAll(async () => {
    await waitForServer(PERF_BASE_URL, 60_000);
  }, 65_000);

  const apiResults: ApiRouteResult[] = [];

  for (const budget of budgets.apiRoutes) {
    it(`${budget.route} p95 < ${budget.p95Ms}ms`, async () => {
      const samples = await measureApiRouteWithWarmup(
        PERF_BASE_URL,
        budget.route,
        budgets.runs.apiRunsPerRoute,
        budgets.runs.warmupRuns.api,
      );

      const p95Value = p95(samples);

      apiResults.push({
        route: budget.route,
        samples,
        p95Ms: p95Value,
      });

      expect(
        p95Value,
        `p95 for ${budget.route}: ${p95Value.toFixed(0)}ms exceeds budget ${budget.p95Ms}ms`,
      ).toBeLessThanOrEqual(budget.p95Ms);
    }, 120_000);
  }

  it('writes API route results artifact', () => {
    if (apiResults.length === 0) return;

    const results: PerfResults = {
      timestamp: new Date().toISOString(),
      commit: getGitCommit(),
      webRoutes: [],
      apiRoutes: apiResults,
    };
    writeResults(results);
  });
});
