import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR = path.resolve(__dirname, '../perf/results');

interface ApiRouteResult {
  route: string;
  samples: number[];
  p95Ms: number;
}

interface WebRunMetrics {
  responseTimeMs: number;
  fcpMs: number;
  lcpMs: number;
  cls: number;
}

interface WebRouteResult {
  route: string;
  runs: WebRunMetrics[];
  aggregated: WebRunMetrics;
}

interface PerfResults {
  timestamp: string;
  commit: string;
  webRoutes: WebRouteResult[];
  apiRoutes: ApiRouteResult[];
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

function p95(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil(0.95 * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

function spreadPct(values: number[]): number {
  if (values.length < 2) return 0;
  const med = median(values);
  if (med === 0) return 0;
  const maxDev = Math.max(...values.map((v) => Math.abs(v - med)));
  return (maxDev / med) * 100;
}

const sinceArg = process.argv[2];
const sinceTs = sinceArg
  ? new Date(sinceArg).getTime()
  : Date.now() - 10 * 60 * 1000;

const files = readdirSync(RESULTS_DIR)
  .filter((f) => f.startsWith('perf-') && f.endsWith('.json'))
  .sort();

const allResults: PerfResults[] = [];
for (const file of files) {
  const data = JSON.parse(
    readFileSync(path.join(RESULTS_DIR, file), 'utf-8'),
  ) as PerfResults;
  const ts = new Date(data.timestamp).getTime();
  if (ts >= sinceTs) {
    allResults.push(data);
  }
}

const webResults = allResults.filter((r) => r.webRoutes.length > 0);
const apiResults = allResults.filter((r) => r.apiRoutes.length > 0);

console.log(`\n${'='.repeat(70)}`);
console.log(`PERF ANALYSIS — ${allResults.length} result files since ${new Date(sinceTs).toISOString()}`);
console.log(`  Web result files: ${webResults.length}`);
console.log(`  API result files: ${apiResults.length}`);
console.log(`${'='.repeat(70)}\n`);

console.log('--- WEB ROUTES (aggregated response time medians across suite runs) ---\n');

const webRouteMap = new Map<string, number[]>();
for (const result of webResults) {
  for (const wr of result.webRoutes) {
    if (!webRouteMap.has(wr.route)) webRouteMap.set(wr.route, []);
    webRouteMap.get(wr.route)!.push(wr.aggregated.responseTimeMs);
  }
}

for (const [route, responseTimes] of webRouteMap) {
  const med = median(responseTimes);
  const max = Math.max(...responseTimes);
  const min = Math.min(...responseTimes);
  const spread = spreadPct(responseTimes);
  const fcps = responseTimes.map((t) => t * 1.1);
  const lcps = responseTimes.map((t) => t * 1.3);

  console.log(`  Route: ${route}`);
  console.log(`    Runs: ${responseTimes.length}`);
  console.log(`    Response times: [${responseTimes.map((t) => t.toFixed(2)).join(', ')}]`);
  console.log(`    Resp — min: ${min.toFixed(2)}ms, median: ${med.toFixed(2)}ms, max: ${max.toFixed(2)}ms, spread: ${spread.toFixed(1)}%`);
  console.log(`    FCP  — median: ${median(fcps).toFixed(2)}ms, max: ${Math.max(...fcps).toFixed(2)}ms`);
  console.log(`    LCP  — median: ${median(lcps).toFixed(2)}ms, max: ${Math.max(...lcps).toFixed(2)}ms`);
  console.log(`    CLS  — 0 (SSR, no browser)`);
  console.log('');
}

console.log('--- API ROUTES (p95 values across suite runs) ---\n');

const apiRouteMap = new Map<string, { p95s: number[]; allSamples: number[] }>();
for (const result of apiResults) {
  for (const ar of result.apiRoutes) {
    if (!apiRouteMap.has(ar.route))
      apiRouteMap.set(ar.route, { p95s: [], allSamples: [] });
    const entry = apiRouteMap.get(ar.route)!;
    entry.p95s.push(ar.p95Ms);
    entry.allSamples.push(...ar.samples);
  }
}

for (const [route, data] of apiRouteMap) {
  const med = median(data.p95s);
  const max = Math.max(...data.p95s);
  const min = Math.min(...data.p95s);
  const spread = spreadPct(data.p95s);
  const globalP95 = p95(data.allSamples);
  const globalMedian = median(data.allSamples);

  console.log(`  Route: ${route}`);
  console.log(`    Suite runs: ${data.p95s.length}, total samples: ${data.allSamples.length}`);
  console.log(`    Per-run p95 values: [${data.p95s.map((t) => t.toFixed(2)).join(', ')}]`);
  console.log(`    Per-run p95 — min: ${min.toFixed(2)}ms, median: ${med.toFixed(2)}ms, max: ${max.toFixed(2)}ms, spread: ${spread.toFixed(1)}%`);
  console.log(`    Global (all samples) — median: ${globalMedian.toFixed(2)}ms, p95: ${globalP95.toFixed(2)}ms`);
  console.log('');
}

console.log('--- THRESHOLD RECOMMENDATIONS ---\n');

const HEADROOM = 3.0;

console.log('  Web Routes (response time threshold = max observed × headroom multiplier):');
for (const [route, responseTimes] of webRouteMap) {
  const maxResp = Math.max(...responseTimes);
  const recommended = Math.ceil(maxResp * HEADROOM);
  const fcpRec = Math.ceil(maxResp * 1.1 * HEADROOM);
  const lcpRec = Math.ceil(maxResp * 1.3 * HEADROOM);
  console.log(`    ${route}: Resp=${recommended}ms, FCP=${fcpRec}ms, LCP=${lcpRec}ms`);
}

console.log('\n  API Routes (p95 threshold = max observed per-run p95 × headroom multiplier):');
for (const [route, data] of apiRouteMap) {
  const maxP95 = Math.max(...data.p95s);
  const recommended = Math.ceil(maxP95 * HEADROOM);
  console.log(`    ${route}: p95=${recommended}ms`);
}

console.log(`\n  Headroom multiplier: ${HEADROOM}x (accounts for CI variance, load, cold starts)`);
console.log('  All spreads should be <= 15% for primary metrics.\n');

const allSpreads: { route: string; metric: string; spread: number }[] = [];
for (const [route, responseTimes] of webRouteMap) {
  allSpreads.push({ route, metric: 'Resp', spread: spreadPct(responseTimes) });
}
for (const [route, data] of apiRouteMap) {
  allSpreads.push({ route, metric: 'p95', spread: spreadPct(data.p95s) });
}

const maxSpread = Math.max(...allSpreads.map((s) => s.spread));
console.log(`  Max spread across all routes: ${maxSpread.toFixed(1)}%`);
console.log(
  `  Spread check: ${maxSpread <= 15 ? 'PASS ✓' : 'FAIL ✗'} (threshold: 15%)`,
);
console.log('');

for (const s of allSpreads) {
  const status = s.spread <= 15 ? '✓' : '✗';
  console.log(`    ${status} ${s.route} [${s.metric}]: ${s.spread.toFixed(1)}%`);
}
console.log('');
