import { z } from 'zod';

const npmsScoreSchema = z.object({
  final: z.number(),
  detail: z.object({
    quality: z.number(),
    popularity: z.number(),
    maintenance: z.number()
  })
});

const npmsResponseSchema = z
  .object({
    score: npmsScoreSchema,
    collected: z
      .object({
        metadata: z.object({
          name: z.string(),
          version: z.string()
        })
      })
      .passthrough()
  })
  .passthrough();

export interface NpmsResult {
  name: string;
  quality: number;
  popularity: number;
  maintenance: number;
  overallScore: number;
}

const TIMEOUT_MS = 5000;

/**
 * Fetch package health scores from npms.io.
 * Never throws — returns null on failure.
 */
export async function fetchNpmsScore(packageName: string, signal?: AbortSignal): Promise<NpmsResult | null> {
  const url = `https://api.npms.io/v2/package/${encodeURIComponent(packageName)}`;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

      const response = await fetch(url, {
        signal: signal ?? controller.signal,
        headers: { Accept: 'application/json' }
      });

      clearTimeout(timeout);

      if (!response.ok) {
        if (response.status === 404) return null; // Package not in npms
        continue; // Retry on server errors
      }

      const parsed = npmsResponseSchema.safeParse(await response.json());
      if (!parsed.success) return null;

      const data = parsed.data;
      return {
        name: data.collected.metadata.name,
        quality: data.score.detail.quality,
        popularity: data.score.detail.popularity,
        maintenance: data.score.detail.maintenance,
        overallScore: data.score.final
      };
    } catch {
      // Retry on network errors, abort on signal
      if (signal?.aborted) return null;
    }
  }

  return null;
}

/**
 * Fetch health scores for multiple packages in parallel.
 * Returns a map of package name → health data.
 */
export async function fetchNpmsScoresBatch(
  packages: Array<{ name: string; version: string }>,
  signal?: AbortSignal
): Promise<Map<string, NpmsResult>> {
  const results = new Map<string, NpmsResult>();

  const settled = await Promise.allSettled(packages.map((pkg) => fetchNpmsScore(pkg.name, signal)));

  for (let i = 0; i < settled.length; i++) {
    const result = settled[i];
    if (result.status === 'fulfilled' && result.value) {
      results.set(packages[i].name, result.value);
    }
  }

  return results;
}
