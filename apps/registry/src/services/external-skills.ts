/**
 * External skills fetcher service.
 *
 * Fetches top/trending skills from skills.sh, caches results in the
 * external_skills DB table. Falls back to curated seed data if the
 * API is unreachable.
 */

import { sql } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '~/lib/db';
import { externalSkills } from '~/lib/db/schema';
import { escapeLike } from '~/lib/skills/data';
import { log as baseLog } from '~/services/logger';

const log = baseLog.child({ module: 'external-skills' });

// ── Zod schemas for external API validation ──────────────────────────────────

const skillsShItemSchema = z
  .object({
    name: z.string().min(1).max(256),
    url: z.string().url().max(2048),
    description: z.string().max(1024).optional(),
    author: z.string().max(128).optional(),
    installs: z.number().int().min(0).optional()
    // Allow unknown fields from external API — we only extract what we need
  })
  .passthrough();

const skillsShResponseSchema = z.union([
  z.array(skillsShItemSchema),
  z.object({ skills: z.array(skillsShItemSchema) }),
  z.object({ leaderboard: z.array(skillsShItemSchema) })
]);

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
    name: 'soultrace',
    url: 'https://skills.sh/soultrace-ai/soultrace-skill/soultrace',
    description: 'AI-powered end-to-end testing and trace analysis for web applications.',
    author: 'soultrace-ai',
    installCount: 45000
  },
  {
    name: 'find-skills',
    url: 'https://skills.sh/vercel-labs/skills/find-skills',
    description: 'Discover and search for AI agent skills across registries.',
    author: 'vercel-labs',
    installCount: 38000
  },
  {
    name: 'microsoft-foundry',
    url: 'https://skills.sh/microsoft/azure-skills/microsoft-foundry',
    description: 'Azure AI Foundry integration for model deployment and management.',
    author: 'microsoft',
    installCount: 32000
  },
  {
    name: 'frontend-design',
    url: 'https://skills.sh/anthropics/skills/frontend-design',
    description: 'High-quality frontend UI generation with design best practices.',
    author: 'anthropics',
    installCount: 28000
  },
  {
    name: 'vercel-react-best-practices',
    url: 'https://skills.sh/vercel-labs/agent-skills/vercel-react-best-practices',
    description: 'React and Next.js best practices for production applications.',
    author: 'vercel-labs',
    installCount: 25000
  },
  {
    name: 'remotion-best-practices',
    url: 'https://skills.sh/remotion-dev/skills/remotion-best-practices',
    description: 'Programmatic video creation with Remotion framework best practices.',
    author: 'remotion-dev',
    installCount: 22000
  },
  {
    name: 'agent-browser',
    url: 'https://skills.sh/vercel-labs/agent-browser/agent-browser',
    description: 'Browser automation for AI agents — navigate, interact, extract data.',
    author: 'vercel-labs',
    installCount: 19000
  },
  {
    name: 'supabase-postgres-best-practices',
    url: 'https://skills.sh/supabase/agent-skills/supabase-postgres-best-practices',
    description: 'PostgreSQL performance optimization and best practices from Supabase.',
    author: 'supabase',
    installCount: 16000
  },
  {
    name: 'skill-creator',
    url: 'https://skills.sh/anthropics/skills/skill-creator',
    description: 'Create and publish AI agent skills with scaffolding and validation.',
    author: 'anthropics',
    installCount: 14000
  },
  {
    name: 'shadcn',
    url: 'https://skills.sh/shadcn/ui/shadcn',
    description: 'Build UIs with shadcn/ui components and design system patterns.',
    author: 'shadcn',
    installCount: 12000
  },
  {
    name: 'impeccable-frontend-design',
    url: 'https://skills.sh/pbakaus/impeccable/frontend-design',
    description: 'Production-grade frontend design with accessibility and performance focus.',
    author: 'pbakaus',
    installCount: 11000
  },
  {
    name: 'lark-base',
    url: 'https://skills.sh/larksuite/cli/lark-base',
    description: 'Lark Base integration for spreadsheet and database operations.',
    author: 'larksuite',
    installCount: 9500
  }
];

// ── Cache warming guard ─────────────────────────────────────────────────────

let warmingPromise: Promise<void> | null = null;

/**
 * Check if the external skills cache is stale (empty or older than 1 hour).
 * Queries the newest updatedAt row to decide.
 */
export async function isCacheStale(ttlMs = 3_600_000): Promise<boolean> {
  const rows = await db
    .select({ updatedAt: externalSkills.updatedAt })
    .from(externalSkills)
    .orderBy(sql`${externalSkills.updatedAt} DESC NULLS LAST`)
    .limit(1);

  if (rows.length === 0) return true;

  const newest = rows[0].updatedAt?.getTime();
  if (!newest) return true;

  return Date.now() - newest > ttlMs;
}

/**
 * Warm the external skills cache with a mutex to prevent thundering herd.
 * If a warm is already in progress, awaits it instead of starting another.
 */
export async function warmCacheIfNeeded(): Promise<void> {
  if (warmingPromise) {
    await warmingPromise;
    return;
  }

  const stale = await isCacheStale();
  if (!stale) return;

  // Re-check after async staleness test — another request may have started warming
  if (warmingPromise) {
    await warmingPromise;
    return;
  }

  warmingPromise = fetchAndCacheExternalSkills().finally(() => {
    warmingPromise = null;
  });
  await warmingPromise;
}

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

    const raw = await response.json();

    // Validate response shape with Zod — reject malformed data
    const parsed = skillsShResponseSchema.safeParse(raw);
    if (!parsed.success) {
      log.warn({ endpoint, error: parsed.error.message }, 'Invalid skills.sh response schema — discarding');
      return [];
    }

    // Normalize: extract items array from validated response
    const data = parsed.data;
    const items = Array.isArray(data) ? data : 'skills' in data ? data.skills : data.leaderboard;
    return items.map((item: z.infer<typeof skillsShItemSchema>) => ({
      name: item.name,
      url: item.url,
      description: item.description,
      author: item.author,
      installs: item.installs ?? 0
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
    const CHUNK_SIZE = 25;

    const toRow = (entry: SkillsShEntry) => ({
      source: 'skills.sh',
      name: entry.name,
      url: entry.url,
      description: entry.description ?? null,
      author: typeof entry.author === 'string' ? entry.author : String(entry.author ?? ''),
      installCount: entry.installs ?? 0
    });

    // Chunk to keep parameter count bounded and avoid query plan blowup
    for (let i = 0; i < validEntries.length; i += CHUNK_SIZE) {
      const chunk = validEntries.slice(i, i + CHUNK_SIZE);
      try {
        await db
          .insert(externalSkills)
          .values(chunk.map(toRow))
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
        log.warn(
          { error: String(err), chunkStart: i, chunkSize: chunk.length },
          'Chunk upsert failed, falling back to serial'
        );
        // Fallback: individual upserts for this chunk only
        for (const entry of chunk) {
          try {
            await db
              .insert(externalSkills)
              .values(toRow(entry))
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
  const pattern = `%${escapeLike(query)}%`;

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
