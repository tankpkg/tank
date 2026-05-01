import chalk from 'chalk';

import { getConfig } from '~/lib/config.js';
import { USER_AGENT } from '~/version.js';

export interface SearchOptions {
  query: string;
  configDir?: string;
}

interface SearchResult {
  name: string;
  description: string | null;
  latestVersion: string | null;
  auditScore?: number | null;
  publisher: string;
  downloads: number;
}

interface SearchResponse {
  results: SearchResult[];
  page: number;
  limit: number;
  total: number;
}

const MAX_DESC_LENGTH = 60;

function scoreColor(score: number): (text: string) => string {
  if (score >= 7) return chalk.green;
  if (score >= 4) return chalk.yellow;
  return chalk.red;
}

function formatScore(score: number | null | undefined): string {
  if (score == null || !Number.isFinite(score)) {
    return chalk.dim(padRight('N/A', 8));
  }

  const scoreStr = Number.isInteger(score) ? score.toFixed(1) : String(score);
  return scoreColor(score)(padRight(scoreStr, 8));
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen - 3)}...`;
}

function padRight(text: string, width: number): string {
  if (text.length >= width) return text;
  return text + ' '.repeat(width - text.length);
}

export async function searchCommand(options: SearchOptions): Promise<void> {
  const { query, configDir } = options;
  const config = getConfig(configDir);

  const url = `${config.registry}/api/v1/search?q=${encodeURIComponent(query)}&limit=20`;

  let res: Response;
  try {
    const headers: Record<string, string> = { 'User-Agent': USER_AGENT };
    if (config.token) {
      headers.Authorization = `Bearer ${config.token}`;
    }
    res = await fetch(url, {
      headers
    });
  } catch (err) {
    throw new Error(`Network error searching: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Search failed: ${res.statusText}`);
  }

  const data = (await res.json()) as SearchResponse;

  if (data.results.length === 0) {
    console.log(`No skills found for "${query}"`);
    return;
  }

  // Print table header
  console.log(`${padRight('NAME', 30) + padRight('VERSION', 10) + padRight('SCORE', 8)}DESCRIPTION`);

  // Print each result
  for (const result of data.results) {
    const name = chalk.bold(padRight(result.name, 30));
    const version = padRight(result.latestVersion ?? '-', 10);
    const score = formatScore(result.auditScore);
    const desc = truncate(result.description ?? '', MAX_DESC_LENGTH);

    console.log(`${name}${version}${score}${desc}`);
  }

  console.log('');
  console.log(`${data.results.length} skill${data.results.length === 1 ? '' : 's'} found`);
}
