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
import { skills, skillVersions, publishers, scanResults, scanFindings } from '@/lib/db/schema';

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
  const entry = queryCache.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    queryCache.delete(key);
    return undefined;
  }
  return entry.data as T;
}

function setCache<T>(key: string, data: T): void {
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
  publisher: { displayName: string; githubUsername: string | null };
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

  const rows = await db
    .select({
      // Skill fields
      skillName: skills.name,
      skillDescription: skills.description,
      skillCreatedAt: skills.createdAt,
      skillUpdatedAt: skills.updatedAt,
      // Publisher
      publisherDisplayName: publishers.displayName,
      publisherGithubUsername: publishers.githubUsername,
      // Download count (scalar subquery, computed once)
      downloadCount:
        sql<number>`coalesce((SELECT count(*)::int FROM skill_downloads WHERE skill_id = ${skills.id}), 0)`,
      skillRepositoryUrl: skills.repositoryUrl,
      // Version fields (null when skill has no versions)
      versionId: skillVersions.id,
      version: skillVersions.version,
      integrity: skillVersions.integrity,
      permissions: skillVersions.permissions,
      manifest: skillVersions.manifest,
      auditScore: skillVersions.auditScore,
      auditStatus: skillVersions.auditStatus,
      publishedAt: skillVersions.createdAt,
      readme: skillVersions.readme,
      versionFileCount: skillVersions.fileCount,
      versionTarballSize: skillVersions.tarballSize,
    })
    .from(skills)
    .innerJoin(publishers, eq(skills.publisherId, publishers.id))
    .leftJoin(skillVersions, eq(skillVersions.skillId, skills.id))
    .where(eq(skills.name, name))
    .orderBy(desc(skillVersions.createdAt));

  if (rows.length === 0) {
    setCache(cacheKey, null);
    return null;
  }

  const first = rows[0];

  // Collect version rows (filter out null versions from LEFT JOIN)
  const versions: SkillVersionSummary[] = rows
    .filter((r) => r.version !== null)
    .map((r) => ({
      version: r.version!,
      integrity: r.integrity!,
      auditScore: r.auditScore,
      auditStatus: r.auditStatus!,
      publishedAt: r.publishedAt!,
    }));

  // Latest version is the first (ordered by created_at DESC)
  const latestRow = versions[0];
  const latestRowData = rows.find(r => r.version === latestRow?.version);

  // Fetch scan results for latest version
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
      .where(eq(scanResults.versionId, latestRowData.versionId))
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
        readme: rows[0].readme ?? null,
        fileCount: rows[0].versionFileCount ?? 0,
        tarballSize: rows[0].versionTarballSize ?? 0,
        scanDetails,
      }
    : null;

  const result: SkillDetailResult = {
    name: first.skillName,
    description: first.skillDescription,
    repositoryUrl: first.skillRepositoryUrl,
    createdAt: first.skillCreatedAt,
    updatedAt: first.skillUpdatedAt,
    publisher: { displayName: first.publisherDisplayName, githubUsername: first.publisherGithubUsername },
    downloadCount: first.downloadCount,
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
    ? sql`to_tsvector('english', ${skills.name} || ' ' || coalesce(${skills.description}, '')) @@ plainto_tsquery('english', ${q})`
    : undefined;

  const baseQuery = db
    .select({
      name: skills.name,
      description: skills.description,
      latestVersion: skillVersions.version,
      auditScore: skillVersions.auditScore,
      publisher: sql<string>`coalesce(${publishers.githubUsername}, ${publishers.displayName})`,
      total: sql<number>`count(*) OVER()`,
    })
    .from(skills)
    .leftJoin(publishers, eq(skills.publisherId, publishers.id))
    .leftJoin(
      skillVersions,
      sql`${skillVersions.skillId} = ${skills.id} AND ${skillVersions.createdAt} = (
        SELECT MAX(sv2.created_at) FROM skill_versions sv2 WHERE sv2.skill_id = ${skills.id}
      )`,
    );

  const results = searchCondition
    ? await baseQuery
        .where(searchCondition)
        .orderBy(
          sql`ts_rank(to_tsvector('english', ${skills.name} || ' ' || coalesce(${skills.description}, '')), plainto_tsquery('english', ${q})) DESC`,
        )
        .offset(offset)
        .limit(limit)
    : await baseQuery
        .orderBy(desc(skills.updatedAt))
        .offset(offset)
        .limit(limit);

  const total = results[0]?.total ?? 0;

  const response: SkillSearchResponse = {
    results: results.map((row) => ({
      name: row.name,
      description: row.description,
      latestVersion: row.latestVersion ?? null,
      auditScore: row.auditScore ?? null,
      publisher: row.publisher ?? '',
      downloads: 0,
    })),
    page,
    limit,
    total,
  };

  setCache(cacheKey, response);
  return response;
}
