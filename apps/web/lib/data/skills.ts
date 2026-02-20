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
import { db } from '@/lib/db';

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
  // Single query: skill + publisher + all versions + scan data for latest version.
  // Scan subqueries use indexed lookups and only add ~1ms overhead.
  // This saves 2 round-trips to Supabase (~300-400ms).
  const rows = await db.execute(sql`
    SELECT
      s.name AS "skillName",
      s.description AS "skillDescription",
      s.created_at AS "skillCreatedAt",
      s.updated_at AS "skillUpdatedAt",
      coalesce(u.name, '') AS "publisherName",
      u.github_username AS "publisherGithubUsername",
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
      sv.tarball_size AS "versionTarballSize",
      -- Scan result for this version (JSON object or NULL)
      (SELECT row_to_json(t) FROM (
        SELECT sr.verdict, sr.stages_run AS "stagesRun", sr.duration_ms AS "durationMs",
               sr.critical_count AS "criticalCount", sr.high_count AS "highCount",
               sr.medium_count AS "mediumCount", sr.low_count AS "lowCount"
        FROM scan_results sr WHERE sr.version_id = sv.id
        ORDER BY sr.created_at DESC LIMIT 1
      ) t) AS "scanResult",
      -- Scan findings for this version (JSON array or NULL)
      (SELECT json_agg(json_build_object(
        'stage', sf.stage, 'severity', sf.severity, 'type', sf.type,
        'description', sf.description, 'location', sf.location,
        'confidence', sf.confidence, 'tool', sf.tool, 'evidence', sf.evidence
      ))
      FROM scan_findings sf
      WHERE sf.scan_id = (
        SELECT sr.id FROM scan_results sr WHERE sr.version_id = sv.id
        ORDER BY sr.created_at DESC LIMIT 1
      )) AS "scanFindings"
    FROM skills s
    LEFT JOIN "user" u ON u.id = s.publisher_id
    LEFT JOIN skill_versions sv ON sv.skill_id = s.id
    WHERE s.name = ${name}
    ORDER BY sv.created_at DESC
  `) as Record<string, unknown>[];

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
      publishedAt: new Date(r.publishedAt as string),
    }));

  // Parse scan data from the latest version row (first row, already ordered DESC)
  const latestRow = versions[0];
  const latestRowData = rows.find(r => r.version === latestRow?.version);
  const scanResultJson = latestRowData?.scanResult as Record<string, unknown> | null;
  const scanFindingsJson = latestRowData?.scanFindings as ScanFinding[] | null;

  const scanDetails: ScanDetails = scanResultJson
    ? {
        verdict: scanResultJson.verdict as string | null,
        stagesRun: (scanResultJson.stagesRun as string[]) || [],
        durationMs: scanResultJson.durationMs as number | null,
        findings: scanFindingsJson || [],
        criticalCount: Number(scanResultJson.criticalCount) || 0,
        highCount: Number(scanResultJson.highCount) || 0,
        mediumCount: Number(scanResultJson.mediumCount) || 0,
        lowCount: Number(scanResultJson.lowCount) || 0,
      }
    : {
        verdict: null, stagesRun: [], durationMs: null, findings: [],
        criticalCount: 0, highCount: 0, mediumCount: 0, lowCount: 0,
      };

  const latestVersion: SkillVersionDetail | null = latestRow
    ? {
        version: latestRow.version,
        integrity: latestRow.integrity,
        permissions: latestRowData?.permissions,
        manifest: latestRowData?.manifest,
        auditScore: latestRow.auditScore,
        auditStatus: latestRow.auditStatus,
        publishedAt: latestRow.publishedAt,
        readme: (latestRowData?.readme as string) ?? null,
        fileCount: Number(latestRowData?.versionFileCount) ?? 0,
        tarballSize: Number(latestRowData?.versionTarballSize) ?? 0,
        scanDetails,
      }
    : null;

  const parsedDownloadCount = Number(first.downloadCount);

  const result: SkillDetailResult = {
    name: first.skillName as string,
    description: (first.skillDescription as string | null),
    repositoryUrl: (first.skillRepositoryUrl as string | null),
    createdAt: new Date(first.skillCreatedAt as string),
    updatedAt: new Date(first.skillUpdatedAt as string),
    publisher: { name: first.publisherName as string, githubUsername: (first.publisherGithubUsername as string | null) },
    downloadCount: Number.isFinite(parsedDownloadCount) ? parsedDownloadCount : 0,
    latestVersion,
    versions,
  };

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

  return response;
}
