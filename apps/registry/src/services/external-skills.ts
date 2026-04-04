/**
 * External skills fetcher service.
 *
 * Fetches top/trending skills from skills.sh, caches results in the
 * external_skills DB table. Falls back to curated seed data if the
 * API is unreachable.
 */

import { sql } from 'drizzle-orm';

import { db } from '~/lib/db';
import { externalSkills } from '~/lib/db/schema';
import { log as baseLog } from '~/services/logger';

const log = baseLog.child({ module: 'external-skills' });

// ── Types ────────────────────────────────────────────────────────────────────

export interface ExternalSkill {
  id: string;
  source: string;
  name: string;
  url: string;
  description: string | null;
  author: string | null;
  installCount: number;
  scanVerdict: string | null;
  scanResult: {
    verdict: string;
    findings: Array<{
      stage: string;
      severity: string;
      type: string;
      description: string;
      location: string | null;
      tool: string | null;
    }>;
    duration_ms: number;
  } | null;
  scannedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

// ── Curated seed data ────────────────────────────────────────────────────────

const SEED_SKILLS: Array<{
  name: string;
  url: string;
  description: string;
  author: string;
  installCount: number;
}> = [
  {
    name: 'context7-docs',
    url: 'https://github.com/contextLabs/context7-docs',
    description: 'Fetch up-to-date documentation for any library or framework via Context7 MCP.',
    author: 'contextLabs',
    installCount: 45000
  },
  {
    name: 'playwright-browser',
    url: 'https://github.com/anthropics/playwright-browser-skill',
    description: 'Browser automation via Playwright — navigate, click, fill forms, extract data.',
    author: 'anthropics',
    installCount: 38000
  },
  {
    name: 'sequential-thinking',
    url: 'https://github.com/modelcontextprotocol/sequential-thinking',
    description: 'Structured chain-of-thought reasoning with backtracking and revision.',
    author: 'modelcontextprotocol',
    installCount: 32000
  },
  {
    name: 'memory-bank',
    url: 'https://github.com/anthropics/memory-bank',
    description: 'Persistent memory management for AI agents across sessions.',
    author: 'anthropics',
    installCount: 28000
  },
  {
    name: 'filesystem-server',
    url: 'https://github.com/modelcontextprotocol/filesystem-server',
    description: 'Secure file system access with configurable root directories.',
    author: 'modelcontextprotocol',
    installCount: 25000
  },
  {
    name: 'github-skills',
    url: 'https://github.com/github/github-mcp-tools',
    description: 'GitHub API integration — repos, issues, PRs, actions.',
    author: 'github',
    installCount: 22000
  },
  {
    name: 'brave-search',
    url: 'https://github.com/brave-com/brave-search-mcp',
    description: 'Web search via Brave Search API with privacy-first approach.',
    author: 'brave-com',
    installCount: 19000
  },
  {
    name: 'sqlite-explorer',
    url: 'https://github.com/modelcontextprotocol/sqlite-explorer',
    description: 'Read-only SQLite database exploration and query tool.',
    author: 'modelcontextprotocol',
    installCount: 16000
  },
  {
    name: 'fetch-web',
    url: 'https://github.com/modelcontextprotocol/fetch-web',
    description: 'HTTP client for fetching web content with HTML-to-markdown conversion.',
    author: 'modelcontextprotocol',
    installCount: 14000
  },
  {
    name: 'puppeteer-crawl',
    url: 'https://github.com/anthropics/puppeteer-crawl-skill',
    description: 'Web crawling and scraping via headless Chrome/Puppeteer.',
    author: 'anthropics',
    installCount: 12000
  },
  {
    name: 'slack-integration',
    url: 'https://github.com/slackapi/slack-mcp-server',
    description: 'Slack workspace integration — send messages, read channels, manage threads.',
    author: 'slackapi',
    installCount: 11000
  },
  {
    name: 'postgres-query',
    url: 'https://github.com/modelcontextprotocol/postgres-query',
    description: 'Execute SQL queries against PostgreSQL databases with safety checks.',
    author: 'modelcontextprotocol',
    installCount: 9500
  }
];

// ── API fetch helpers ────────────────────────────────────────────────────────

interface SkillsShEntry {
  name: string;
  url: string;
  description?: string;
  author?: string;
  installs?: number;
}

async function fetchFromSkillsSh(endpoint: string): Promise<SkillsShEntry[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const response = await fetch(endpoint, {
      signal: controller.signal,
      headers: { Accept: 'application/json' }
    });

    if (!response.ok) return [];

    const data = await response.json();

    // Normalize: handle both array and { skills: [...] } shapes
    const items = Array.isArray(data) ? data : (data?.skills ?? data?.leaderboard ?? []);
    return items.map((item: Record<string, unknown>) => ({
      name: String(item.name ?? item.skill_name ?? ''),
      url: String(item.url ?? item.repository_url ?? item.github_url ?? ''),
      description: item.description ? String(item.description) : undefined,
      author: item.author ?? item.owner ?? item.publisher ?? undefined,
      installs:
        typeof item.installs === 'number'
          ? item.installs
          : typeof item.install_count === 'number'
            ? item.install_count
            : 0
    }));
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Fetch top skills from skills.sh and upsert into DB cache.
 * Tries multiple endpoints, falls back to seed data.
 */
export async function fetchAndCacheExternalSkills(): Promise<void> {
  const endpoints = ['https://skills.sh/api/skills?sort=installs&limit=50', 'https://skills.sh/api/leaderboard'];

  let entries: SkillsShEntry[] = [];

  for (const endpoint of endpoints) {
    entries = await fetchFromSkillsSh(endpoint);
    if (entries.length > 0) {
      log.info({ endpoint, count: entries.length }, 'Fetched external skills from API');
      break;
    }
  }

  // Fallback to seed data
  if (entries.length === 0) {
    log.info('Using seed data for external skills (API unreachable)');
    entries = SEED_SKILLS.map((s) => ({
      name: s.name,
      url: s.url,
      description: s.description,
      author: s.author,
      installs: s.installCount
    }));
  }

  // Batch upsert into DB
  const validEntries = entries.filter((e) => e.name && e.url);
  if (validEntries.length > 0) {
    try {
      await db
        .insert(externalSkills)
        .values(
          validEntries.map((entry) => ({
            source: 'skills.sh',
            name: entry.name,
            url: entry.url,
            description: entry.description ?? null,
            author: typeof entry.author === 'string' ? entry.author : String(entry.author ?? ''),
            installCount: entry.installs ?? 0
          }))
        )
        .onConflictDoUpdate({
          target: [externalSkills.source, externalSkills.url],
          set: {
            name: sql`EXCLUDED.name`,
            description: sql`EXCLUDED.description`,
            author: sql`EXCLUDED.author`,
            installCount: sql`EXCLUDED.install_count`,
            updatedAt: new Date()
          }
        });
    } catch (err) {
      log.warn({ error: String(err), count: validEntries.length }, 'Batch upsert failed, falling back to serial');
      // Fallback: serial upsert for robustness
      for (const entry of validEntries) {
        try {
          await db
            .insert(externalSkills)
            .values({
              source: 'skills.sh',
              name: entry.name,
              url: entry.url,
              description: entry.description ?? null,
              author: typeof entry.author === 'string' ? entry.author : String(entry.author ?? ''),
              installCount: entry.installs ?? 0
            })
            .onConflictDoUpdate({
              target: [externalSkills.source, externalSkills.url],
              set: {
                name: entry.name,
                description: entry.description ?? null,
                author: typeof entry.author === 'string' ? entry.author : String(entry.author ?? ''),
                installCount: entry.installs ?? 0,
                updatedAt: new Date()
              }
            });
        } catch (innerErr) {
          log.warn({ name: entry.name, error: String(innerErr) }, 'Failed to upsert external skill');
        }
      }
    }
  }
}

/**
 * Get top external skills from cache, ordered by install count.
 */
export async function getTopExternalSkills(limit: number): Promise<ExternalSkill[]> {
  const rows = await db
    .select()
    .from(externalSkills)
    .orderBy(sql`${externalSkills.installCount} DESC NULLS LAST`)
    .limit(limit);

  return rows.map((row) => ({
    id: row.id,
    source: row.source,
    name: row.name,
    url: row.url,
    description: row.description,
    author: row.author,
    installCount: row.installCount ?? 0,
    scanVerdict: row.scanVerdict,
    scanResult: row.scanResult,
    scannedAt: row.scannedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  }));
}

/**
 * Search cached external skills by name or description.
 */
export async function searchExternalSkills(query: string, limit: number): Promise<ExternalSkill[]> {
  const pattern = `%${query.replace(/[%_]/g, '\\$&')}%`;

  const rows = await db
    .select()
    .from(externalSkills)
    .where(sql`${externalSkills.name} ILIKE ${pattern} OR ${externalSkills.description} ILIKE ${pattern}`)
    .orderBy(sql`${externalSkills.installCount} DESC NULLS LAST`)
    .limit(limit);

  return rows.map((row) => ({
    id: row.id,
    source: row.source,
    name: row.name,
    url: row.url,
    description: row.description,
    author: row.author,
    installCount: row.installCount ?? 0,
    scanVerdict: row.scanVerdict,
    scanResult: row.scanResult,
    scannedAt: row.scannedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  }));
}
