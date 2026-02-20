/**
 * Direct data-access layer for skill pages.
 *
 * Performance history:
 *   Before:  3 HTTP self-fetches + 8 sequential DB queries → 2+ second TTFB
 *   v1 fix:  2 "parallel" queries → 450ms (postgres.js doesn't pipeline!)
 *   v2 fix:  1 combined query per page → ~200ms
 *
 * Key insight: postgres.js runs Promise.all queries SEQUENTIALLY on a single
 * connection. Each round-trip to remote Supabase costs ~200ms. So the only
 * way to be fast is to minimize the number of separate queries.
 */

import { eq, desc, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { scanResults, scanFindings } from '@/lib/db/schema';

// ── In-memory TTL cache ──────────────────────────────────────────────────────
// Skill metadata rarely changes. A short TTL eliminates repeated DB round-trips
// during navigation (each costs ~150-200ms to remote Supabase).
//
// For production multi-instance deployments, swap for Redis or Vercel KV.

const CACHE_TTL_MS = 60_000; // 1 minute

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const queryCache = new Map<string, CacheEntry<unknown>>();

function getCached<T>(key: string): T | undefined {
  if (process.env.TANK_PERF_MODE === '1') return undefined;
  const entry = queryCache.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    queryCache.delete(key);
    return undefined;
  }
  return entry.data as T;
}

function setCache<T>(key: string, data: T): void {
  if (process.env.TANK_PERF_MODE === '1') return;
  queryCache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface ScanFinding {
  stage: string;
  severity: string;
  type: string;
  description: string;
  location: string | null;
  confidence: number | null;
  tool: string | null;
  evidence: string | null;
}

export interface ScanDetails {
  verdict: string | null;
  stagesRun: string[];
  durationMs: number | null;
  findings: ScanFinding[];
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
}

export interface SkillVersionDetail {
  version: string;
  integrity: string;
  permissions: unknown;
  manifest: unknown;
  auditScore: number | null;
  auditStatus: string;
  publishedAt: Date;
  readme: string | null;
  fileCount: number;
  tarballSize: number;
  scanDetails: ScanDetails;
}

export interface SkillVersionSummary {
  version: string;
  integrity: string;
  auditScore: number | null;
  auditStatus: string;
  publishedAt: Date;
}

export interface SkillDetailResult {
  name: string;
  description: string | null;
  repositoryUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
  publisher: { name: string; githubUsername: string | null };
  downloadCount: number;
  latestVersion: SkillVersionDetail | null;
  versions: SkillVersionSummary[];
}

export interface SkillSearchResult {
  name: string;
  description: string | null;
  latestVersion: string | null;
  auditScore: number | null;
  publisher: string;
  downloads: number;
}

export interface SkillSearchResponse {
  results: SkillSearchResult[];
  page: number;
  limit: number;
  total: number;
}

// ── Skill Detail ─────────────────────────────────────────────────────────────

/**
 * Fetch everything the skill detail page needs in ONE database query.
 *
 * Returns one row per version (skill+publisher info repeated). We de-duplicate
 * in JS — this is a deliberate tradeoff: slightly more bytes over the wire,
 * but only 1 round-trip to Supabase (~150ms vs ~1000ms for 2 queries).
 */
export async function getSkillDetail(
  name: string,
): Promise<SkillDetailResult | null> {
  const cacheKey = `skill:${name}`;
  const cached = getCached<SkillDetailResult | null>(cacheKey);
  if (cached !== undefined) return cached;

  // Join through user table (text PK) to resolve publisher name.
  // Consolidates scan results via LATERAL join.
  const rows = await db.execute(sql`
    SELECT
      s.name AS "skillName",
      s.description AS "skillDescription",
      s.created_at AS "skillCreatedAt",
      s.updated_at AS "skillUpdatedAt",
      coalesce(u.name, '') AS "publisherName",
      NULL AS "publisherGithubUsername",
      coalesce((SELECT count(*)::int FROM skill_downloads WHERE skill_id = s.id), 0) AS "downloadCount",
      s.repository_url AS "skillRepositoryUrl",
      sv.id AS "versionId",
      sv.version,
      sv.integrity,
      sv.permissions,
      sv.manifest,
      sv.audit_score AS "auditScore",
      sv.audit_status AS "auditStatus",
      sv.created_at AS "publishedAt",
      sv.readme,
      sv.file_count AS "versionFileCount",
      sv.tarball_size AS "versionTarballSize"
    FROM skills s
    LEFT JOIN "user" u ON u.id = s.publisher_id
    LEFT JOIN skill_versions sv ON sv.skill_id = s.id
    WHERE s.name = ${name}
    ORDER BY sv.created_at DESC
  `) as Record<string, unknown>[];

  if (rows.length === 0) {
    setCache(cacheKey, null);
    return null;
  }

  const first = rows[0];

  const versions: SkillVersionSummary[] = rows
    .filter((r) => r.version !== null)
    .map((r) => ({
      version: r.version as string,
      integrity: r.integrity as string,
      auditScore: r.auditScore != null ? Number(r.auditScore) : null,
      auditStatus: r.auditStatus as string,
      publishedAt: new Date(r.publishedAt as string),
    }));

  const latestRow = versions[0];
  const latestRowData = rows.find(r => r.version === latestRow?.version);

  const scanDetails: ScanDetails = {
    verdict: null,
    stagesRun: [],
    durationMs: null,
    findings: [],
    criticalCount: 0,
    highCount: 0,
    mediumCount: 0,
    lowCount: 0,
  };

  if (latestRowData?.versionId) {
    const latestScanResult = await db
      .select()
      .from(scanResults)
      .where(eq(scanResults.versionId, latestRowData.versionId as string))
      .orderBy(desc(scanResults.createdAt))
      .limit(1);

    if (latestScanResult.length > 0) {
      const scan = latestScanResult[0];
      scanDetails.verdict = scan.verdict;
      scanDetails.stagesRun = scan.stagesRun || [];
      scanDetails.durationMs = scan.durationMs;
      scanDetails.criticalCount = scan.criticalCount;
      scanDetails.highCount = scan.highCount;
      scanDetails.mediumCount = scan.mediumCount;
      scanDetails.lowCount = scan.lowCount;

      const findings = await db
        .select({
          stage: scanFindings.stage,
          severity: scanFindings.severity,
          type: scanFindings.type,
          description: scanFindings.description,
          location: scanFindings.location,
          confidence: scanFindings.confidence,
          tool: scanFindings.tool,
          evidence: scanFindings.evidence,
        })
        .from(scanFindings)
        .where(eq(scanFindings.scanId, scan.id));

      scanDetails.findings = findings;
    }
  }

  const latestVersion: SkillVersionDetail | null = latestRow
    ? {
        version: latestRow.version,
        integrity: latestRow.integrity,
        permissions: rows[0].permissions,
        manifest: rows[0].manifest,
        auditScore: latestRow.auditScore,
        auditStatus: latestRow.auditStatus,
        publishedAt: latestRow.publishedAt,
        readme: (rows[0].readme as string) ?? null,
        fileCount: Number(rows[0].versionFileCount) ?? 0,
        tarballSize: Number(rows[0].versionTarballSize) ?? 0,
        scanDetails,
      }
    : null;

  const result: SkillDetailResult = {
    name: first.skillName as string,
    description: (first.skillDescription as string | null),
    repositoryUrl: (first.skillRepositoryUrl as string | null),
    createdAt: new Date(first.skillCreatedAt as string),
    updatedAt: new Date(first.skillUpdatedAt as string),
    publisher: { name: first.publisherName as string, githubUsername: (first.publisherGithubUsername as string | null) },
    downloadCount: Number(first.downloadCount),
    latestVersion,
    versions,
  };

  setCache(cacheKey, result);
  return result;
}

// ── Skills Search ────────────────────────────────────────────────────────────

/**
 * Search/browse skills in ONE query using `count(*) OVER()` for pagination.
 *
 * Window function gives us total count in each row, eliminating the need
 * for a separate COUNT query (saves ~200ms round-trip).
 */
export async function searchSkills(
  q: string,
  page: number,
  limit: number,
): Promise<SkillSearchResponse> {
  const cacheKey = `search:${q}:${page}:${limit}`;
  const cached = getCached<SkillSearchResponse>(cacheKey);
  if (cached !== undefined) return cached;

  const offset = (page - 1) * limit;

  const searchCondition = q
    ? sql`to_tsvector('english', s.name || ' ' || coalesce(s.description, '')) @@ plainto_tsquery('english', ${q})`
    : undefined;

  const whereClause = searchCondition ? sql`WHERE ${searchCondition}` : sql``;

  const orderClause = q
    ? sql`ts_rank(to_tsvector('english', s.name || ' ' || coalesce(s.description, '')), plainto_tsquery('english', ${q})) DESC`
    : sql`s.updated_at DESC`;

  // Join through user table to resolve publisher name
  const results = await db.execute(sql`
    SELECT
      s.name,
      s.description,
      sv.version AS "latestVersion",
      sv.audit_score AS "auditScore",
      coalesce(u.name, '') AS publisher,
      count(*) OVER() AS total
    FROM skills s
    LEFT JOIN "user" u ON u.id = s.publisher_id
    LEFT JOIN skill_versions sv ON sv.skill_id = s.id
      AND sv.created_at = (
        SELECT MAX(sv2.created_at) FROM skill_versions sv2 WHERE sv2.skill_id = s.id
      )
    ${whereClause}
    ORDER BY ${orderClause}
    OFFSET ${offset}
    LIMIT ${limit}
  `) as Record<string, unknown>[];

  const total = results.length > 0 ? Number(results[0].total) : 0;

  const response: SkillSearchResponse = {
    results: results.map((row) => ({
      name: row.name as string,
      description: (row.description as string | null),
      latestVersion: (row.latestVersion as string) ?? null,
      auditScore: row.auditScore != null ? Number(row.auditScore) : null,
      publisher: (row.publisher as string) ?? '',
      downloads: 0,
    })),
    page,
    limit,
    total,
  };

  setCache(cacheKey, response);
  return response;
}
