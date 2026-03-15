import { readdirSync, readFileSync } from 'node:fs';
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
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
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
const sinceTs = sinceArg ? new Date(sinceArg).getTime() : Date.now() - 10 * 60 * 1000;

const files = readdirSync(RESULTS_DIR)
  .filter((f) => f.startsWith('perf-') && f.endsWith('.json'))
  .sort();

const allResults: PerfResults[] = [];
for (const file of files) {
  const data = JSON.parse(readFileSync(path.join(RESULTS_DIR, file), 'utf-8')) as PerfResults;
  const ts = new Date(data.timestamp).getTime();
  if (ts >= sinceTs) {
    allResults.push(data);
  }
}

const webResults = allResults.filter((r) => r.webRoutes.length > 0);
const apiResults = allResults.filter((r) => r.apiRoutes.length > 0);

const webRouteMap = new Map<string, number[]>();
for (const result of webResults) {
  for (const wr of result.webRoutes) {
    if (!webRouteMap.has(wr.route)) webRouteMap.set(wr.route, []);
    webRouteMap.get(wr.route)?.push(wr.aggregated.responseTimeMs);
  }
}

for (const [_route, responseTimes] of webRouteMap) {
  const _med = median(responseTimes);
  const _max = Math.max(...responseTimes);
  const _min = Math.min(...responseTimes);
  const _spread = spreadPct(responseTimes);
  const _fcps = responseTimes.map((t) => t * 1.1);
  const _lcps = responseTimes.map((t) => t * 1.3);
}

const apiRouteMap = new Map<string, { p95s: number[]; allSamples: number[] }>();
for (const result of apiResults) {
  for (const ar of result.apiRoutes) {
    let entry = apiRouteMap.get(ar.route);
    if (!entry) {
      entry = { p95s: [], allSamples: [] };
      apiRouteMap.set(ar.route, entry);
    }
    entry.p95s.push(ar.p95Ms);
    entry.allSamples.push(...ar.samples);
  }
}

for (const [_route, data] of apiRouteMap) {
  const _med = median(data.p95s);
  const _max = Math.max(...data.p95s);
  const _min = Math.min(...data.p95s);
  const _spread = spreadPct(data.p95s);
  const _globalP95 = p95(data.allSamples);
  const _globalMedian = median(data.allSamples);
}

const HEADROOM = 3.0;
for (const [_route, responseTimes] of webRouteMap) {
  const maxResp = Math.max(...responseTimes);
  const _recommended = Math.ceil(maxResp * HEADROOM);
  const _fcpRec = Math.ceil(maxResp * 1.1 * HEADROOM);
  const _lcpRec = Math.ceil(maxResp * 1.3 * HEADROOM);
}
for (const [_route, data] of apiRouteMap) {
  const maxP95 = Math.max(...data.p95s);
  const _recommended = Math.ceil(maxP95 * HEADROOM);
}

const allSpreads: { route: string; metric: string; spread: number }[] = [];
for (const [route, responseTimes] of webRouteMap) {
  allSpreads.push({ route, metric: 'Resp', spread: spreadPct(responseTimes) });
}
for (const [route, data] of apiRouteMap) {
  allSpreads.push({ route, metric: 'p95', spread: spreadPct(data.p95s) });
}

const _maxSpread = Math.max(...allSpreads.map((s) => s.spread));

for (const s of allSpreads) {
  const _status = s.spread <= 15 ? '✓' : '✗';
}
