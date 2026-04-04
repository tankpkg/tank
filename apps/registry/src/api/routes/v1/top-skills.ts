/**
 * GET /api/v1/skills/top — Top skills showcase endpoint.
 *
 * Returns both internal Tank registry skills and external skills.sh skills,
 * ranked by popularity (downloads / installs) with scan verdicts.
 */

import { sql } from 'drizzle-orm';
import { Hono } from 'hono';

import { resolveRequestUserId } from '~/lib/auth/authz';
import { db } from '~/lib/db';
import { getTopExternalSkills, searchExternalSkills } from '~/services/external-skills';
import { log as baseLog } from '~/services/logger';
import { authFreeLimiter } from '../../middleware/rate-limit';

const log = baseLog.child({ module: 'api:top-skills' });

export const topSkillsRoutes = new Hono();

interface SeverityCounts {
  critical: number;
  high: number;
  medium: number;
  low: number;
}

interface InternalSkillSummary {
  name: string;
  description: string | null;
  latestVersion: string | null;
  scanVerdict: string | null;
  publisher: string;
  downloads: number;
  url: string | null;
  severityCounts: SeverityCounts;
}

interface ExternalSkillSummary {
  id: string;
  name: string;
  description: string | null;
  author: string | null;
  installCount: number;
  scanVerdict: string | null;
  url: string;
  severityCounts: SeverityCounts;
}

interface TopSkillsResponse {
  internal: InternalSkillSummary[];
  external: ExternalSkillSummary[];
  total: number;
}

topSkillsRoutes.get('/skills/top', async (c) => {
  // Rate limiting
  const userId = await resolveRequestUserId(c.req.raw);
  const rateKey = userId ?? c.req.header('x-forwarded-for') ?? c.req.header('x-real-ip') ?? 'unknown';
  const { allowed, remaining, retryAfter } = authFreeLimiter.check(rateKey);
  if (!allowed) {
    c.header('Retry-After', String(retryAfter));
    return c.json({ error: 'Rate limit exceeded', retryAfter }, 429);
  }
  c.header('X-RateLimit-Remaining', String(remaining));

  const page = Math.max(1, Number(c.req.query('page') ?? '1'));
  const limit = Math.min(50, Math.max(1, Number(c.req.query('limit') ?? '20')));
  const source = c.req.query('source') ?? 'all'; // 'internal' | 'external' | 'all'
  const q = c.req.query('q') ?? '';

  const offset = (page - 1) * limit;
  let total = 0;
  let internal: InternalSkillSummary[] = [];
  let external: ExternalSkillSummary[] = [];

  // Internal skills: top by download count
  if (source === 'all' || source === 'internal') {
    try {
      const searchCondition = q
        ? sql`AND (s.name ILIKE ${`%${q.replace(/[%_]/g, '\\$&')}%`} OR s.description ILIKE ${`%${q.replace(/[%_]/g, '\\$&')}%`})`
        : sql``;

      const rows = (await db.execute(sql`
        SELECT
          s.name,
          s.description,
          s.repository_url AS "url",
          sv.version AS "latestVersion",
          sr.verdict AS "scanVerdict",
          coalesce(u.name, '') AS publisher,
          coalesce((SELECT sum(count)::int FROM skill_download_daily WHERE skill_id = s.id AND date >= CURRENT_DATE - 30), 0) AS downloads,
          coalesce(sr.critical_count, 0) AS "criticalCount",
          coalesce(sr.high_count, 0) AS "highCount",
          coalesce(sr.medium_count, 0) AS "mediumCount",
          coalesce(sr.low_count, 0) AS "lowCount",
          count(*) OVER() AS total
        FROM skills s
        LEFT JOIN "user" u ON u.id = s.publisher_id
        LEFT JOIN skill_versions sv ON sv.skill_id = s.id
          AND sv.created_at = (
            SELECT MAX(sv2.created_at) FROM skill_versions sv2 WHERE sv2.skill_id = s.id
          )
        LEFT JOIN scan_results sr ON sr.version_id = sv.id
          AND sr.created_at = (
            SELECT MAX(sr2.created_at) FROM scan_results sr2 WHERE sr2.version_id = sv.id
          )
        WHERE s.visibility = 'public' AND s.status = 'active'
        ${searchCondition}
        ORDER BY downloads DESC, s.updated_at DESC
        OFFSET ${offset}
        LIMIT ${limit}
      `)) as Record<string, unknown>[];

      total += rows.length > 0 ? Number(rows[0].total) : 0;

      internal = rows.map((row) => ({
        name: row.name as string,
        description: row.description as string | null,
        url: row.url as string | null,
        latestVersion: (row.latestVersion as string) ?? null,
        scanVerdict: (row.scanVerdict as string) ?? null,
        publisher: (row.publisher as string) ?? '',
        downloads: Number(row.downloads) || 0,
        severityCounts: {
          critical: Number(row.criticalCount) || 0,
          high: Number(row.highCount) || 0,
          medium: Number(row.mediumCount) || 0,
          low: Number(row.lowCount) || 0
        }
      }));
    } catch (err) {
      log.error({ error: String(err) }, 'Failed to fetch internal top skills');
    }
  }

  // External skills: top by install count
  if (source === 'all' || source === 'external') {
    try {
      const extLimit = source === 'external' ? limit : Math.ceil(limit / 2);
      const extSkills = q ? await searchExternalSkills(q, extLimit) : await getTopExternalSkills(extLimit);

      total += extSkills.length;

      external = extSkills.map((s) => {
        // Derive severity counts from scanResult findings
        const findings = s.scanResult?.findings ?? [];
        const severityCounts = {
          critical: findings.filter((f) => f.severity === 'critical').length,
          high: findings.filter((f) => f.severity === 'high').length,
          medium: findings.filter((f) => f.severity === 'medium').length,
          low: findings.filter((f) => f.severity === 'low').length
        };

        return {
          id: s.id,
          name: s.name,
          description: s.description,
          author: s.author,
          installCount: s.installCount,
          scanVerdict: s.scanVerdict,
          url: s.url,
          severityCounts
        };
      });
    } catch (err) {
      log.error({ error: String(err) }, 'Failed to fetch external top skills');
    }
  }

  const response: TopSkillsResponse = { internal, external, total };
  return c.json(response);
});
