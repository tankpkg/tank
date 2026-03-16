#!/usr/bin/env npx tsx
/**
 * CI performance report: reads latest results, compares against budgets,
 * prints summary, exits non-zero on breaches.
 *
 * Usage: bun --filter=registry-legacy run perf:report
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

// Mirrored from tests/perf/helpers/budgets.ts — standalone script can't import test helpers
interface WebRouteBudget {
  route: string;
  responseTimeMs: number;
  lcpMs: number;
  fcpMs: number;
  cls: number;
}

interface ApiRouteBudget {
  route: string;
  p95Ms: number;
  sampleCount: number;
}

interface PerfBudgets {
  webRoutes: WebRouteBudget[];
  apiRoutes: ApiRouteBudget[];
  runs: {
    webRunsPerRoute: number;
    apiRunsPerRoute: number;
    warmupRuns: { web: number; api: number };
  };
  gating: {
    webAggregation: string;
    apiAggregation: string;
    maxVariancePct: number;
  };
}

interface WebRouteResult {
  route: string;
  runs: Array<{ responseTimeMs: number; fcpMs: number; lcpMs: number; cls: number }>;
  aggregated: { responseTimeMs: number; fcpMs: number; lcpMs: number; cls: number };
}

interface ApiRouteResult {
  route: string;
  samples: number[];
  p95Ms: number;
}

interface PerfResults {
  timestamp: string;
  commit: string;
  webRoutes: WebRouteResult[];
  apiRoutes: ApiRouteResult[];
}

const PERF_DIR = path.resolve(__dirname, '../perf');
const BUDGETS_PATH = path.join(PERF_DIR, 'budgets.json');
const RESULTS_PATH = path.join(PERF_DIR, 'results', 'latest.json');

function _padRight(s: string, len: number): string {
  return s.length >= len ? s : s + ' '.repeat(len - s.length);
}

function _fmtMs(actual: number, budget: number): string {
  const tag = actual > budget ? '!' : ' ';
  return `${actual.toFixed(0)}/${budget}${tag}`;
}

function _fmtCls(actual: number, budget: number): string {
  const tag = actual > budget ? '!' : ' ';
  return `${actual.toFixed(3)}/${budget}${tag}`;
}

function main(): void {
  let budgets: PerfBudgets;
  let results: PerfResults;

  try {
    budgets = JSON.parse(readFileSync(BUDGETS_PATH, 'utf-8'));
  } catch {
    process.exit(2);
  }

  try {
    results = JSON.parse(readFileSync(RESULTS_PATH, 'utf-8'));
  } catch {
    process.exit(2);
  }

  const breaches: string[] = [];

  if (results.webRoutes.length > 0) {
    for (const result of results.webRoutes) {
      const budget = budgets.webRoutes.find((b) => b.route === result.route);
      if (!budget) {
        continue;
      }

      const agg = result.aggregated;
      const respOk = agg.responseTimeMs <= budget.responseTimeMs;
      const fcpOk = agg.fcpMs <= budget.fcpMs;
      const lcpOk = agg.lcpMs <= budget.lcpMs;
      const clsOk = agg.cls <= budget.cls;
      const _allOk = respOk && fcpOk && lcpOk && clsOk;

      if (!respOk)
        breaches.push(`${result.route} Response: ${agg.responseTimeMs.toFixed(0)}ms > ${budget.responseTimeMs}ms`);
      if (!fcpOk) breaches.push(`${result.route} FCP: ${agg.fcpMs.toFixed(0)}ms > ${budget.fcpMs}ms`);
      if (!lcpOk) breaches.push(`${result.route} LCP: ${agg.lcpMs.toFixed(0)}ms > ${budget.lcpMs}ms`);
      if (!clsOk) breaches.push(`${result.route} CLS: ${agg.cls.toFixed(3)} > ${budget.cls}`);
    }
  }

  if (results.apiRoutes.length > 0) {
    for (const result of results.apiRoutes) {
      const budget = budgets.apiRoutes.find((b) => b.route === result.route);
      if (!budget) {
        continue;
      }

      const ok = result.p95Ms <= budget.p95Ms;

      if (!ok) breaches.push(`${result.route} p95: ${result.p95Ms.toFixed(0)}ms > ${budget.p95Ms}ms`);
    }
  }

  if (breaches.length === 0) {
    process.exit(0);
  }
  for (const _b of breaches) {
  }
  process.exit(1);
}

main();
