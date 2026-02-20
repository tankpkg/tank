#!/usr/bin/env npx tsx
/**
 * CI performance report: reads latest results, compares against budgets,
 * prints summary, exits non-zero on breaches.
 *
 * Usage: pnpm --filter=web run perf:report
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

// Mirrored from tests/perf/helpers/budgets.ts — standalone script can't import test helpers
interface WebRouteBudget {
  route: string;
  ttfbMs: number;
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
  runs: Array<{ ttfbMs: number; fcpMs: number; lcpMs: number; cls: number }>;
  aggregated: { ttfbMs: number; fcpMs: number; lcpMs: number; cls: number };
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

function padRight(s: string, len: number): string {
  return s.length >= len ? s : s + ' '.repeat(len - s.length);
}

function fmtMs(actual: number, budget: number): string {
  const tag = actual > budget ? '!' : ' ';
  return `${actual.toFixed(0)}/${budget}${tag}`;
}

function fmtCls(actual: number, budget: number): string {
  const tag = actual > budget ? '!' : ' ';
  return `${actual.toFixed(3)}/${budget}${tag}`;
}

function main(): void {
  let budgets: PerfBudgets;
  let results: PerfResults;

  try {
    budgets = JSON.parse(readFileSync(BUDGETS_PATH, 'utf-8'));
  } catch {
    console.error('ERROR: Cannot read budgets file:', BUDGETS_PATH);
    process.exit(2);
  }

  try {
    results = JSON.parse(readFileSync(RESULTS_PATH, 'utf-8'));
  } catch {
    console.error('ERROR: Cannot read results file:', RESULTS_PATH);
    console.error('Run perf:test first to generate results.');
    process.exit(2);
  }

  const breaches: string[] = [];

  console.log('='.repeat(72));
  console.log('  PERFORMANCE REPORT');
  console.log(`  Commit: ${results.commit}`);
  console.log(`  Timestamp: ${results.timestamp}`);
  console.log('='.repeat(72));

  if (results.webRoutes.length > 0) {
    console.log('\n--- Web Routes (no-cache, median) ---\n');
    console.log(
      padRight('Route', 40) +
        padRight('TTFB', 12) +
        padRight('FCP', 12) +
        padRight('LCP', 12) +
        padRight('CLS', 10) +
        'Status',
    );
    console.log('-'.repeat(96));

    for (const result of results.webRoutes) {
      const budget = budgets.webRoutes.find((b) => b.route === result.route);
      if (!budget) {
        console.log(`${padRight(result.route, 40)}  (no budget defined)`);
        continue;
      }

      const agg = result.aggregated;
      const ttfbOk = agg.ttfbMs <= budget.ttfbMs;
      const fcpOk = agg.fcpMs <= budget.fcpMs;
      const lcpOk = agg.lcpMs <= budget.lcpMs;
      const clsOk = agg.cls <= budget.cls;
      const allOk = ttfbOk && fcpOk && lcpOk && clsOk;

      console.log(
        padRight(result.route, 40) +
          padRight(fmtMs(agg.ttfbMs, budget.ttfbMs), 12) +
          padRight(fmtMs(agg.fcpMs, budget.fcpMs), 12) +
          padRight(fmtMs(agg.lcpMs, budget.lcpMs), 12) +
          padRight(fmtCls(agg.cls, budget.cls), 10) +
          (allOk ? 'PASS' : 'FAIL'),
      );

      if (!ttfbOk) breaches.push(`${result.route} TTFB: ${agg.ttfbMs.toFixed(0)}ms > ${budget.ttfbMs}ms`);
      if (!fcpOk) breaches.push(`${result.route} FCP: ${agg.fcpMs.toFixed(0)}ms > ${budget.fcpMs}ms`);
      if (!lcpOk) breaches.push(`${result.route} LCP: ${agg.lcpMs.toFixed(0)}ms > ${budget.lcpMs}ms`);
      if (!clsOk) breaches.push(`${result.route} CLS: ${agg.cls.toFixed(3)} > ${budget.cls}`);
    }
  }

  if (results.apiRoutes.length > 0) {
    console.log('\n--- API Routes (no-cache, p95) ---\n');
    console.log(
      padRight('Route', 50) +
        padRight('p95', 12) +
        padRight('Samples', 10) +
        'Status',
    );
    console.log('-'.repeat(82));

    for (const result of results.apiRoutes) {
      const budget = budgets.apiRoutes.find((b) => b.route === result.route);
      if (!budget) {
        console.log(`${padRight(result.route, 50)}  (no budget defined)`);
        continue;
      }

      const ok = result.p95Ms <= budget.p95Ms;

      console.log(
        padRight(result.route, 50) +
          padRight(fmtMs(result.p95Ms, budget.p95Ms), 12) +
          padRight(String(result.samples.length), 10) +
          (ok ? 'PASS' : 'FAIL'),
      );

      if (!ok) breaches.push(`${result.route} p95: ${result.p95Ms.toFixed(0)}ms > ${budget.p95Ms}ms`);
    }
  }

  console.log('\n' + '='.repeat(72));

  if (breaches.length === 0) {
    console.log('  RESULT: ALL BUDGETS PASSED');
    console.log('='.repeat(72));
    process.exit(0);
  }

  console.log(`  RESULT: ${breaches.length} BUDGET BREACH(ES) DETECTED`);
  console.log('='.repeat(72));
  console.log('\nBreaches:');
  for (const b of breaches) {
    console.log(`  - ${b}`);
  }
  console.log('');
  process.exit(1);
}

main();
