import { getConfig } from '~/lib/config.js';
import { USER_AGENT } from '~/version.js';

interface SearchResult {
  name: string;
  description?: string | null;
}

interface SearchResponse {
  results: SearchResult[];
}

/**
 * Best-effort fuzzy lookup of similar skill names. Hits the public /api/v1/search
 * endpoint (no auth needed for public skills). Returns up to `limit` matches.
 * Silent failure: never throws — suggestions are advisory, not critical-path.
 */
export async function fetchSimilarSkillNames(
  query: string,
  opts: { configDir?: string; limit?: number; timeoutMs?: number } = {}
): Promise<SearchResult[]> {
  const { configDir, limit = 3, timeoutMs = 2000 } = opts;
  const config = getConfig(configDir);

  const bareName = query.replace(/^@[^/]+\//, '').replace(/^[^a-z0-9]+/i, '');
  const searchTerm = bareName || query;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${config.registry}/api/v1/search?q=${encodeURIComponent(searchTerm)}&limit=${limit}`, {
      headers: { 'User-Agent': USER_AGENT },
      signal: controller.signal
    });
    clearTimeout(timer);
    if (!res.ok) return [];
    const data = (await res.json()) as SearchResponse;
    return (data.results ?? []).filter((r) => r.name && r.name !== query).slice(0, limit);
  } catch {
    clearTimeout(timer);
    return [];
  }
}

export function formatInstallSuggestions(name: string, suggestions: SearchResult[]): string {
  if (suggestions.length === 0) {
    return `Try \`tank search ${name}\` to find similar packages.`;
  }
  const lines = ['Did you mean one of these?'];
  for (const s of suggestions) {
    lines.push(`  • ${s.name}${s.description ? `  — ${s.description.slice(0, 60)}` : ''}`);
  }
  lines.push(`\nOr search: \`tank search ${name}\``);
  return lines.join('\n');
}
