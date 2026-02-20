import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

export interface WebRouteBudget {
  route: string;
  ttfbMs: number;
  lcpMs: number;
  fcpMs: number;
  cls: number;
}

export interface ApiRouteBudget {
  route: string;
  p95Ms: number;
  sampleCount: number;
}

export interface RunConfig {
  webRunsPerRoute: number;
  apiRunsPerRoute: number;
  warmupRuns: {
    web: number;
    api: number;
  };
}

export interface GatingConfig {
  webAggregation: 'median' | 'p95';
  apiAggregation: 'median' | 'p95';
  maxVariancePct: number;
}

export interface PerfBudgets {
  webRoutes: WebRouteBudget[];
  apiRoutes: ApiRouteBudget[];
  runs: RunConfig;
  gating: GatingConfig;
}

const PERF_DIR = path.resolve(__dirname, '../../../perf');
const BUDGETS_PATH = path.join(PERF_DIR, 'budgets.json');
const RESULTS_DIR = path.join(PERF_DIR, 'results');
const LATEST_RESULTS_PATH = path.join(RESULTS_DIR, 'latest.json');

export function loadBudgets(): PerfBudgets {
  const raw = readFileSync(BUDGETS_PATH, 'utf-8');
  return JSON.parse(raw) as PerfBudgets;
}

export interface WebRouteResult {
  route: string;
  runs: Array<{
    ttfbMs: number;
    fcpMs: number;
    lcpMs: number;
    cls: number;
  }>;
  aggregated: {
    ttfbMs: number;
    fcpMs: number;
    lcpMs: number;
    cls: number;
  };
}

export interface ApiRouteResult {
  route: string;
  samples: number[];
  p95Ms: number;
}

export interface PerfResults {
  timestamp: string;
  commit: string;
  webRoutes: WebRouteResult[];
  apiRoutes: ApiRouteResult[];
}

export function writeResults(results: PerfResults): void {
  mkdirSync(RESULTS_DIR, { recursive: true });
  writeFileSync(LATEST_RESULTS_PATH, JSON.stringify(results, null, 2));

  const timestamped = path.join(
    RESULTS_DIR,
    `perf-${results.timestamp.replace(/[:.]/g, '-')}.json`,
  );
  writeFileSync(timestamped, JSON.stringify(results, null, 2));
}

export function getResultsPath(): string {
  return LATEST_RESULTS_PATH;
}
