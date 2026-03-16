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

import { sql } from 'drizzle-orm';

import { db } from '~/lib/db';
import { visibilityClause } from '~/lib/db/visibility';

// ── Types ────────────────────────────────────────────────────────────────────

export interface ScanFinding {
  stage: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  type: string;
  description: string;
  location: string | null;
  confidence: number | null;
  tool: string | null;
  evidence: string | null;
  llm_verdict?: string | null;
  llm_reviewed?: boolean;
}

export interface LLMAnalysisInfo {
  enabled: boolean;
  mode: string;
  providers?: Array<{
    name: string;
    model: string;
    api_key_configured: boolean;
    base_url: string;
    status: string;
    latency_ms: number | null;
    error: string | null;
  }>;
}

export interface ScanDetails {
  verdict: string | null;
  stagesRun: string[];
  durationMs: number | null;
  scannedAt: Date | null;
  findings: ScanFinding[];
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  llm_analysis?: LLMAnalysisInfo | null;
}

export interface SkillVersionDetail {
  version: string;
  integrity: string;
  // biome-ignore lint/suspicious/noExplicitAny: JSONB columns have dynamic shape
  permissions: Record<string, any>;
  // biome-ignore lint/suspicious/noExplicitAny: JSONB columns have dynamic shape
  manifest: Record<string, any>;
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
  visibility: 'public' | 'private';
  repositoryUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
  publisher: { name: string; githubUsername: string | null };
  downloadCount: number;
  starCount: number;
  isStarred: boolean;
  latestVersion: SkillVersionDetail | null;
  versions: SkillVersionSummary[];
}

export interface SkillSearchResult {
  name: string;
  description: string | null;
  visibility: 'public' | 'private';
  latestVersion: string | null;
  auditScore: number | null;
  publisher: string;
  downloads: number;
  stars: number;
  updatedAt?: Date;
}

export interface SkillSearchResponse {
  results: SkillSearchResult[];
  page: number;
  limit: number;
  total: number;
}

// ── Search params ─────────────────────────────────────────────────────────────

export type SortOption = 'updated' | 'downloads' | 'stars' | 'score' | 'name';
export type VisibilityFilter = 'all' | 'public' | 'private';
export type ScoreBucket = 'all' | 'high' | 'medium' | 'low';
export type FreshnessBucket = 'all' | 'week' | 'month' | 'year';
export type PopularityBucket = 'all' | 'popular' | 'growing' | 'new';

export interface SkillsSearchParams {
  q: string;
  page: number;
  limit: number;
  sort: SortOption;
  visibility: VisibilityFilter;
  scoreBucket: ScoreBucket;
  freshness?: FreshnessBucket;
  popularity?: PopularityBucket;
  hasReadme?: boolean;
  requesterUserId?: string | null;
}

let skillStarsTableExists: boolean | null = null;

async function hasSkillStarsTable(): Promise<boolean> {
  if (skillStarsTableExists !== null) {
    return skillStarsTableExists;
  }

  try {
    const rows = (await db.execute(sql`
      SELECT to_regclass('public.skill_stars') IS NOT NULL AS "exists"
    `)) as Record<string, unknown>[];

    skillStarsTableExists = Boolean(rows[0]?.exists);
  } catch {
    skillStarsTableExists = false;
  }

  return skillStarsTableExists;
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
  viewerUserId: string | null = null
): Promise<SkillDetailResult | null> {
  const starsTableAvailable = await hasSkillStarsTable();
  const visClause = visibilityClause(viewerUserId);
  const starCountSql = starsTableAvailable
    ? sql`coalesce((SELECT count(*)::int FROM skill_stars WHERE skill_id = s.id), 0)`
    : sql`0`;
  const isStarredSql =
    starsTableAvailable && viewerUserId
      ? sql`EXISTS(SELECT 1 FROM skill_stars WHERE skill_id = s.id AND user_id = ${viewerUserId})`
      : sql`false`;

  const rows = (await db.execute(sql`
    SELECT
      s.name AS "skillName",
      s.description AS "skillDescription",
      s.visibility AS "skillVisibility",
      s.created_at AS "skillCreatedAt",
      s.updated_at AS "skillUpdatedAt",
      coalesce(u.name, '') AS "publisherName",
      u.github_username AS "publisherGithubUsername",
      coalesce((SELECT sum(count)::int FROM skill_download_daily WHERE skill_id = s.id AND date >= CURRENT_DATE - 7), 0) AS "downloadCount",
      ${starCountSql} AS "starCount",
      ${isStarredSql} AS "isStarred",
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
      sv.tarball_size AS "versionTarballSize",
      (SELECT row_to_json(t) FROM (
        SELECT sr.verdict, sr.stages_run AS "stagesRun", sr.duration_ms AS "durationMs",
               sr.critical_count AS "criticalCount", sr.high_count AS "highCount",
               sr.medium_count AS "mediumCount", sr.low_count AS "lowCount",
               sr.created_at AS "scannedAt", sr.llm_analysis AS "llm_analysis"
        FROM scan_results sr WHERE sr.version_id = sv.id
        ORDER BY sr.created_at DESC LIMIT 1
      ) t) AS "scanResult",
      (SELECT json_agg(json_build_object(
        'stage', sf.stage, 'severity', sf.severity, 'type', sf.type,
        'description', sf.description, 'location', sf.location,
        'confidence', sf.confidence, 'tool', sf.tool, 'evidence', sf.evidence,
        'llm_verdict', sf.llm_verdict, 'llm_reviewed', sf.llm_reviewed
      ))
      FROM scan_findings sf
      WHERE sf.scan_id = (
        SELECT sr.id FROM scan_results sr WHERE sr.version_id = sv.id
        ORDER BY sr.created_at DESC LIMIT 1
      )) AS "scanFindings"
    FROM skills s
    LEFT JOIN "user" u ON u.id = s.publisher_id
    LEFT JOIN skill_versions sv ON sv.skill_id = s.id
    WHERE s.name = ${name} AND ${visClause}
    ORDER BY sv.created_at DESC
  `)) as Record<string, unknown>[];

  if (rows.length === 0) {
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
      publishedAt: new Date(r.publishedAt as string)
    }));

  // Parse scan data from the latest version row (first row, already ordered DESC)
  const latestRow = versions[0];
  const latestRowData = rows.find((r) => r.version === latestRow?.version);
  const scanResultJson = latestRowData?.scanResult as Record<string, unknown> | null;
  const scanFindingsJson = latestRowData?.scanFindings as ScanFinding[] | null;

  // Safely parse scannedAt date
  let scannedAt: Date | null = null;
  if (scanResultJson?.scannedAt) {
    try {
      const parsed = new Date(scanResultJson.scannedAt as string);
      if (!Number.isNaN(parsed.getTime())) {
        scannedAt = parsed;
      }
    } catch {
      // Invalid date, keep as null
    }
  }

  const scanDetails: ScanDetails = scanResultJson
    ? {
        verdict: scanResultJson.verdict as string | null,
        stagesRun: Array.isArray(scanResultJson.stagesRun) ? (scanResultJson.stagesRun as string[]) : [],
        durationMs: typeof scanResultJson.durationMs === 'number' ? scanResultJson.durationMs : null,
        scannedAt,
        findings: Array.isArray(scanFindingsJson) ? scanFindingsJson : [],
        criticalCount: Number(scanResultJson.criticalCount) || 0,
        highCount: Number(scanResultJson.highCount) || 0,
        mediumCount: Number(scanResultJson.mediumCount) || 0,
        lowCount: Number(scanResultJson.lowCount) || 0,
        llm_analysis:
          scanResultJson.llm_analysis && typeof scanResultJson.llm_analysis === 'object'
            ? (scanResultJson.llm_analysis as LLMAnalysisInfo)
            : null
      }
    : {
        verdict: null,
        stagesRun: [],
        durationMs: null,
        scannedAt: null,
        findings: [],
        criticalCount: 0,
        highCount: 0,
        mediumCount: 0,
        lowCount: 0,
        llm_analysis: null
      };

  const latestVersion: SkillVersionDetail | null = latestRow
    ? {
        version: latestRow.version,
        integrity: latestRow.integrity,
        permissions: (latestRowData?.permissions ?? {}) as Record<string, unknown>,
        manifest: (latestRowData?.manifest ?? {}) as Record<string, unknown>,
        auditScore: latestRow.auditScore,
        auditStatus: latestRow.auditStatus,
        publishedAt: latestRow.publishedAt,
        readme: (latestRowData?.readme as string) ?? null,
        fileCount: Number(latestRowData?.versionFileCount ?? 0),
        tarballSize: Number(latestRowData?.versionTarballSize ?? 0),
        scanDetails
      }
    : null;

  const parsedDownloadCount = Number(first.downloadCount);

  const result: SkillDetailResult = {
    name: first.skillName as string,
    description: first.skillDescription as string | null,
    visibility: (first.skillVisibility as 'public' | 'private') ?? 'public',
    repositoryUrl: first.skillRepositoryUrl as string | null,
    createdAt: new Date(first.skillCreatedAt as string),
    updatedAt: new Date(first.skillUpdatedAt as string),
    publisher: { name: first.publisherName as string, githubUsername: first.publisherGithubUsername as string | null },
    downloadCount: Number.isFinite(parsedDownloadCount) ? parsedDownloadCount : 0,
    starCount: Number(first.starCount) || 0,
    isStarred: Boolean(first.isStarred),
    latestVersion,
    versions
  };

  return result;
}

// ── Skills Search ────────────────────────────────────────────────────────────

function escapeLike(input: string): string {
  return input.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

/**
 * Build the primary ORDER BY expression (without final tiebreaker).
 * The tiebreaker (`s.id ASC`) is appended separately so that other
 * ranking criteria (e.g. relevance during text search) can be inserted
 * between the primary sort and the deterministic tiebreaker.
 *
 * `starsAvailable` must be passed to guard against the `st` alias
 * being absent when the `skill_stars` table doesn't exist.
 */
function buildPrimarySort(sort: SortOption, starsAvailable: boolean) {
  switch (sort) {
    case 'downloads':
      return sql`coalesce(dl.downloads_7d, 0) DESC`;
    case 'stars':
      return starsAvailable ? sql`coalesce(st.stars_count, 0) DESC` : sql`s.updated_at DESC`;
    case 'score':
      return sql`coalesce(sv.audit_score, 0) DESC`;
    case 'name':
      return sql`s.name ASC`;
    default:
      return sql`s.updated_at DESC`;
  }
}

/**
 * Build score bucket WHERE fragment.
 */
function buildScoreBucketClause(scoreBucket: ScoreBucket) {
  switch (scoreBucket) {
    case 'high':
      return sql`AND coalesce(sv.audit_score, 0) >= 7`;
    case 'medium':
      return sql`AND coalesce(sv.audit_score, 0) >= 4 AND coalesce(sv.audit_score, 0) < 7`;
    case 'low':
      return sql`AND sv.audit_score IS NOT NULL AND sv.audit_score < 4`;
    default:
      return sql``;
  }
}

/**
 * Build visibility filter WHERE fragment (applied on top of the access-control clause).
 * Only meaningful when the user is logged in and wants to see only public or only private.
 */
function buildVisibilityFilterClause(visibility: VisibilityFilter) {
  if (visibility === 'public') return sql`AND s.visibility = 'public'`;
  if (visibility === 'private') return sql`AND s.visibility = 'private'`;
  return sql``;
}

function buildFreshnessClause(freshness: FreshnessBucket | undefined) {
  switch (freshness) {
    case 'week':
      return sql`AND s.updated_at >= CURRENT_DATE - INTERVAL '7 days'`;
    case 'month':
      return sql`AND s.updated_at >= CURRENT_DATE - INTERVAL '30 days'`;
    case 'year':
      return sql`AND s.updated_at >= CURRENT_DATE - INTERVAL '365 days'`;
    default:
      return sql``;
  }
}

function buildPopularityClause(popularity: PopularityBucket | undefined) {
  switch (popularity) {
    case 'popular':
      return sql`AND coalesce((SELECT sum(count)::int FROM skill_download_daily WHERE skill_id = s.id AND date >= CURRENT_DATE - 7), 0) >= 10`;
    case 'growing':
      return sql`AND coalesce((SELECT sum(count)::int FROM skill_download_daily WHERE skill_id = s.id AND date >= CURRENT_DATE - 7), 0) BETWEEN 1 AND 9`;
    case 'new':
      return sql`AND coalesce((SELECT sum(count)::int FROM skill_download_daily WHERE skill_id = s.id AND date >= CURRENT_DATE - 7), 0) = 0`;
    default:
      return sql``;
  }
}

function buildReadmeClause(hasReadme: boolean | undefined) {
  if (hasReadme) return sql`AND sv.readme IS NOT NULL AND sv.readme != ''`;
  return sql``;
}

/**
 * Hybrid search combining three strategies:
 *   1. ILIKE on name — partial, prefix, org-scoped matches
 *   2. pg_trgm similarity on name — typo/fuzzy tolerance
 *   3. Full-text search on name+description — full-word relevance
 *
 * Results are ranked by a weighted composite score so exact/prefix name
 * matches always surface first, followed by fuzzy hits, then description-
 * only keyword matches.
 *
 * Pass `requesterUserId` via params to control visibility filtering.
 *
 * Supports new filter params: sort, visibility, scoreBucket.
 * Old positional signature (q, page, limit, requesterUserId?) still works
 * for backward compatibility with existing callers.
 */
export async function searchSkills(
  paramsOrQ: SkillsSearchParams | string,
  page?: number,
  limit?: number,
  requesterUserId?: string | null
): Promise<SkillSearchResponse> {
  // Normalize: support both new object API and old positional API
  let params: SkillsSearchParams;
  if (typeof paramsOrQ === 'string') {
    params = {
      q: paramsOrQ,
      page: page ?? 1,
      limit: limit ?? 20,
      sort: 'updated',
      visibility: 'all',
      scoreBucket: 'all',
      requesterUserId
    };
  } else {
    params = paramsOrQ;
  }

  const { q, sort, visibility, scoreBucket, freshness, popularity, hasReadme } = params;
  const resolvedPage = params.page;
  const resolvedLimit = params.limit;

  const viewerUserId = params.requesterUserId ?? null;
  const starsTableAvailable = await hasSkillStarsTable();
  const visClause = visibilityClause(viewerUserId);
  const offset = (resolvedPage - 1) * resolvedLimit;

  const needsDownloads = sort === 'downloads';

  // Pre-aggregated subquery JOINs (only included when needed for sort)
  const downloadJoin = needsDownloads
    ? sql`LEFT JOIN (
        SELECT skill_id, SUM(count)::int AS downloads_7d
        FROM skill_download_daily
        WHERE date >= CURRENT_DATE - 7
        GROUP BY skill_id
      ) dl ON dl.skill_id = s.id`
    : sql``;

  const starsJoin = starsTableAvailable
    ? sql`LEFT JOIN (
        SELECT skill_id, COUNT(*)::int AS stars_count
        FROM skill_stars
        GROUP BY skill_id
      ) st ON st.skill_id = s.id`
    : sql``;

  // Inline downloads for display (when not using the aggregated join)
  const downloadsSql = needsDownloads
    ? sql`coalesce(dl.downloads_7d, 0)`
    : sql`coalesce((SELECT sum(count)::int FROM skill_download_daily WHERE skill_id = s.id AND date >= CURRENT_DATE - 7), 0)`;

  const starsSql = starsTableAvailable ? sql`coalesce(st.stars_count, 0)` : sql`0`;

  const primarySort = buildPrimarySort(sort, starsTableAvailable);
  const scoreBucketClause = buildScoreBucketClause(scoreBucket);
  const visibilityFilterClause = buildVisibilityFilterClause(visibility);
  const freshnessClause = buildFreshnessClause(freshness);
  const popularityClause = buildPopularityClause(popularity);
  const readmeClause = buildReadmeClause(hasReadme);

  if (!q) {
    const results = (await db.execute(sql`
      SELECT
        s.name,
        s.description,
        s.visibility,
        s.updated_at AS "updatedAt",
        sv.version AS "latestVersion",
        sv.audit_score AS "auditScore",
        coalesce(u.name, '') AS publisher,
        ${downloadsSql} AS downloads,
        ${starsSql} AS stars,
        count(*) OVER() AS total
      FROM skills s
      LEFT JOIN "user" u ON u.id = s.publisher_id
      LEFT JOIN skill_versions sv ON sv.skill_id = s.id
        AND sv.created_at = (
          SELECT MAX(sv2.created_at) FROM skill_versions sv2 WHERE sv2.skill_id = s.id
        )
      ${downloadJoin}
      ${starsJoin}
      WHERE ${visClause}
      ${visibilityFilterClause}
      ${scoreBucketClause}
      ${freshnessClause}
      ${popularityClause}
      ${readmeClause}
      ORDER BY ${primarySort}, s.id ASC
      OFFSET ${offset}
      LIMIT ${resolvedLimit}
    `)) as Record<string, unknown>[];

    return mapSearchResults(results, resolvedPage, resolvedLimit);
  }

  const escaped = escapeLike(q);

  const results = (await db.execute(sql`
    SELECT
      s.name,
      s.description,
      s.visibility,
      s.updated_at AS "updatedAt",
      sv.version AS "latestVersion",
      sv.audit_score AS "auditScore",
      coalesce(u.name, '') AS publisher,
      ${downloadsSql} AS downloads,
      ${starsSql} AS stars,
      count(*) OVER() AS total
    FROM skills s
    LEFT JOIN "user" u ON u.id = s.publisher_id
    LEFT JOIN skill_versions sv ON sv.skill_id = s.id
      AND sv.created_at = (
        SELECT MAX(sv2.created_at) FROM skill_versions sv2 WHERE sv2.skill_id = s.id
      )
    ${downloadJoin}
    ${starsJoin}
    WHERE (
      s.name ILIKE ${`%${escaped}%`}
      OR similarity(s.name, ${q}) > 0.15
      OR similarity(split_part(s.name, '/', 2), ${q}) > 0.15
      OR to_tsvector('english', s.name || ' ' || coalesce(s.description, ''))
         @@ plainto_tsquery('english', ${q})
    )
    AND ${visClause}
    ${visibilityFilterClause}
    ${scoreBucketClause}
    ${freshnessClause}
    ${popularityClause}
    ${readmeClause}
    ORDER BY ${sort !== 'updated' ? sql`${primarySort},` : sql``} (
      CASE WHEN lower(s.name) = lower(${q}) THEN 1000 ELSE 0 END
      + CASE WHEN s.name ILIKE ${`${q}%`} THEN 800 ELSE 0 END
      + CASE WHEN s.name ILIKE ${`%/${escaped}%`} THEN 600 ELSE 0 END
      + CASE WHEN s.name ILIKE ${`%${escaped}%`} THEN 400 ELSE 0 END
      + (greatest(similarity(s.name, ${q}), similarity(split_part(s.name, '/', 2), ${q})) * 300)::int
      + (ts_rank(
          to_tsvector('english', s.name || ' ' || coalesce(s.description, '')),
          plainto_tsquery('english', ${q})
        ) * 100)::int
    ) DESC, s.updated_at DESC, s.id ASC
    OFFSET ${offset}
    LIMIT ${resolvedLimit}
  `)) as Record<string, unknown>[];

  return mapSearchResults(results, resolvedPage, resolvedLimit);
}

function mapSearchResults(rows: Record<string, unknown>[], page: number, limit: number): SkillSearchResponse {
  const total = rows.length > 0 ? Number(rows[0].total) : 0;

  return {
    results: rows.map((row) => ({
      name: row.name as string,
      description: row.description as string | null,
      visibility: (row.visibility as 'public' | 'private') ?? 'public',
      latestVersion: (row.latestVersion as string) ?? null,
      auditScore: row.auditScore != null ? Number(row.auditScore) : null,
      publisher: (row.publisher as string) ?? '',
      downloads: Number(row.downloads) || 0,
      stars: Number(row.stars) || 0,
      updatedAt: row.updatedAt ? new Date(row.updatedAt as string) : undefined
    })),
    page,
    limit,
    total
  };
}
