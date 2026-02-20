import { describe, it, expect, beforeAll } from 'vitest';
import { execSync } from 'node:child_process';
import { loadBudgets, writeResults } from './helpers/budgets.js';
import type { WebRouteResult, PerfResults } from './helpers/budgets.js';
import { median, measureWebRouteWithWarmup } from './helpers/metrics.js';
import { PERF_BASE_URL, waitForServer } from './helpers/server.js';

const budgets = loadBudgets();

function getGitCommit(): string {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim();
  } catch {
    return 'unknown';
  }
}

describe('P0 Web Route Performance (no-cache)', () => {
  beforeAll(async () => {
    await waitForServer(PERF_BASE_URL, 60_000);
  }, 65_000);

  const webResults: WebRouteResult[] = [];

  for (const budget of budgets.webRoutes) {
    describe(`${budget.route}`, () => {
      it(`TTFB median < ${budget.ttfbMs}ms`, async () => {
        const runs = await measureWebRouteWithWarmup(
          PERF_BASE_URL,
          budget.route,
          budgets.runs.webRunsPerRoute,
          budgets.runs.warmupRuns.web,
        );

        const ttfbValues = runs.map((r) => r.ttfbMs);
        const medianTtfb = median(ttfbValues);

        const aggregated = {
          ttfbMs: medianTtfb,
          fcpMs: median(runs.map((r) => r.fcpMs)),
          lcpMs: median(runs.map((r) => r.lcpMs)),
          cls: median(runs.map((r) => r.cls)),
        };

        webResults.push({
          route: budget.route,
          runs: runs.map((r) => ({
            ttfbMs: r.ttfbMs,
            fcpMs: r.fcpMs,
            lcpMs: r.lcpMs,
            cls: r.cls,
          })),
          aggregated,
        });

        expect(
          medianTtfb,
          `TTFB for ${budget.route}: ${medianTtfb.toFixed(0)}ms exceeds budget ${budget.ttfbMs}ms`,
        ).toBeLessThanOrEqual(budget.ttfbMs);
      }, 120_000);

      it(`FCP median < ${budget.fcpMs}ms`, async () => {
        const runs = await measureWebRouteWithWarmup(
          PERF_BASE_URL,
          budget.route,
          budgets.runs.webRunsPerRoute,
          budgets.runs.warmupRuns.web,
        );

        const medianFcp = median(runs.map((r) => r.fcpMs));

        expect(
          medianFcp,
          `FCP for ${budget.route}: ${medianFcp.toFixed(0)}ms exceeds budget ${budget.fcpMs}ms`,
        ).toBeLessThanOrEqual(budget.fcpMs);
      }, 120_000);

      it(`LCP median < ${budget.lcpMs}ms`, async () => {
        const runs = await measureWebRouteWithWarmup(
          PERF_BASE_URL,
          budget.route,
          budgets.runs.webRunsPerRoute,
          budgets.runs.warmupRuns.web,
        );

        const medianLcp = median(runs.map((r) => r.lcpMs));

        expect(
          medianLcp,
          `LCP for ${budget.route}: ${medianLcp.toFixed(0)}ms exceeds budget ${budget.lcpMs}ms`,
        ).toBeLessThanOrEqual(budget.lcpMs);
      }, 120_000);

      it(`CLS median < ${budget.cls}`, async () => {
        const runs = await measureWebRouteWithWarmup(
          PERF_BASE_URL,
          budget.route,
          budgets.runs.webRunsPerRoute,
          budgets.runs.warmupRuns.web,
        );

        const medianCls = median(runs.map((r) => r.cls));

        expect(
          medianCls,
          `CLS for ${budget.route}: ${medianCls.toFixed(3)} exceeds budget ${budget.cls}`,
        ).toBeLessThanOrEqual(budget.cls);
      }, 120_000);
    });
  }

  it('writes web route results artifact', () => {
    if (webResults.length === 0) return;

    const results: PerfResults = {
      timestamp: new Date().toISOString(),
      commit: getGitCommit(),
      webRoutes: webResults,
      apiRoutes: [],
    };
    writeResults(results);
  });
});
