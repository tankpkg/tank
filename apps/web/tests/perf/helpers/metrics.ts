export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function p95(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil(0.95 * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

export function variancePct(values: number[]): number {
  if (values.length < 2) return 0;
  const med = median(values);
  if (med === 0) return 0;
  const maxDev = Math.max(...values.map((v) => Math.abs(v - med)));
  return (maxDev / med) * 100;
}

export interface WebMetrics {
  ttfbMs: number;
  fcpMs: number;
  lcpMs: number;
  cls: number;
}

/**
 * TTFB via fetch timing. FCP/LCP approximated as TTFB * multiplier
 * (no real browser in Task 1). CLS=0 for SSR without browser context.
 */
export async function measureWebRoute(
  baseUrl: string,
  route: string,
): Promise<WebMetrics> {
  const url = `${baseUrl}${route}`;

  const start = performance.now();
  const response = await fetch(url, {
    headers: {
      'Cache-Control': 'no-cache, no-store',
      Pragma: 'no-cache',
    },
  });
  await response.text();
  const ttfbMs = performance.now() - start;

  if (!response.ok) {
    throw new Error(
      `Web route ${route} returned ${response.status}: ${response.statusText}`,
    );
  }

  return {
    ttfbMs,
    fcpMs: ttfbMs * 1.1,
    lcpMs: ttfbMs * 1.3,
    cls: 0,
  };
}

export async function measureApiRoute(
  baseUrl: string,
  route: string,
): Promise<number> {
  const url = `${baseUrl}${route}`;

  const start = performance.now();
  const response = await fetch(url, {
    headers: {
      'Cache-Control': 'no-cache, no-store',
      Pragma: 'no-cache',
    },
  });
  await response.text();
  const elapsed = performance.now() - start;

  // 404 acceptable for unseeded routes (Task 2 adds seed data)
  if (!response.ok && response.status !== 404) {
    throw new Error(
      `API route ${route} returned ${response.status}: ${response.statusText}`,
    );
  }

  return elapsed;
}

export async function measureWebRouteWithWarmup(
  baseUrl: string,
  route: string,
  runs: number,
  warmupRuns: number,
): Promise<WebMetrics[]> {
  for (let i = 0; i < warmupRuns; i++) {
    try {
      await measureWebRoute(baseUrl, route);
    } catch {
      // warmup failures non-fatal
    }
  }

  const results: WebMetrics[] = [];
  for (let i = 0; i < runs; i++) {
    results.push(await measureWebRoute(baseUrl, route));
  }
  return results;
}

export async function measureApiRouteWithWarmup(
  baseUrl: string,
  route: string,
  samples: number,
  warmupRuns: number,
): Promise<number[]> {
  for (let i = 0; i < warmupRuns; i++) {
    try {
      await measureApiRoute(baseUrl, route);
    } catch {
      // warmup failures non-fatal
    }
  }

  const results: number[] = [];
  for (let i = 0; i < samples; i++) {
    results.push(await measureApiRoute(baseUrl, route));
  }
  return results;
}
