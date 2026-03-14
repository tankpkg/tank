import { sql } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { resolveRequestUserId } from '@/lib/auth-helpers';
import { db } from '@/lib/db';
import { getStorageProvider } from '@/lib/storage/provider';

async function recordDownload(skillId: string): Promise<void> {
  await db.execute(sql`
    INSERT INTO skill_download_daily (id, skill_id, date, count)
    VALUES (gen_random_uuid(), ${skillId}, CURRENT_DATE, 1)
    ON CONFLICT (skill_id, date) DO UPDATE SET count = skill_download_daily.count + 1
  `);
}

/**
 * GET /api/v1/skills/[name]/[version]
 *
 * Consolidation: skill+version merged into 1 query (was 2).
 * Download count + scan + findings merged into 1 query (was 3).
 * Supabase signedUrl is external (cannot consolidate).
 * recordDownload stays fire-and-forget.
 * Round-trips: 3 (was 5-6). Breakdown: 1 skill+version, 1 signedUrl, 1 count+scan+findings.
 */
export async function GET(request: Request, { params }: { params: Promise<{ name: string; version: string }> }) {
  try {
    const requesterUserId = await resolveRequestUserId(request);
    const { name: rawName, version } = await params;
    const name = decodeURIComponent(rawName);
    const visibilityClause = requesterUserId
      ? sql`(
        s.visibility = 'public'
        OR s.publisher_id = ${requesterUserId}
        OR (
          s.visibility = 'private'
          AND (
            (s.org_id IS NOT NULL AND EXISTS (SELECT 1 FROM "member" m WHERE m.organization_id = s.org_id AND m.user_id = ${requesterUserId}))
            OR EXISTS (
              SELECT 1
              FROM skill_access sa
              WHERE sa.skill_id = s.id
                AND (
                  sa.granted_user_id = ${requesterUserId}
                  OR (
                    sa.granted_org_id IS NOT NULL
                    AND EXISTS (
                      SELECT 1 FROM "member" m2
                      WHERE m2.organization_id = sa.granted_org_id
                        AND m2.user_id = ${requesterUserId}
                    )
                  )
                )
            )
          )
        )
      )`
      : sql`s.visibility = 'public'`;

    // Query 1: skill + version in one shot
    const skillVersionRows = await db.execute(sql`
      SELECT
        s.id AS "skillId",
        s.name,
        s.visibility,
        s.description,
        sv.id AS "versionId",
        sv.version,
        sv.integrity,
        sv.permissions,
        sv.audit_score AS "auditScore",
        sv.audit_status AS "auditStatus",
        sv.tarball_path AS "tarballPath",
        sv.created_at AS "publishedAt",
        sv.manifest->'skills' AS "dependencies"
      FROM skills s
      INNER JOIN skill_versions sv ON sv.skill_id = s.id AND sv.version = ${version}
      WHERE s.name = ${name} AND ${visibilityClause}
      LIMIT 1
    `);

    if (skillVersionRows.length === 0) {
      // Distinguish skill-not-found vs version-not-found
      const skillCheck = await db.execute(sql`
        SELECT s.id
        FROM skills s
        WHERE s.name = ${name} AND ${visibilityClause}
        LIMIT 1
      `);

      if (skillCheck.length === 0) {
        return NextResponse.json({ error: 'Skill not found' }, { status: 404 });
      }
      return NextResponse.json({ error: `Version ${version} not found for ${name}` }, { status: 404 });
    }

    const row = skillVersionRows[0] as Record<string, unknown>;
    const skillId = row.skillId as string;
    const versionId = row.versionId as string;
    const tarballPath = row.tarballPath as string;

    // Query 2: signed URL (external, cannot consolidate)
    let signedDownloadUrl: string;
    try {
      const downloadData = await getStorageProvider().createSignedUrl(tarballPath, 3600);
      signedDownloadUrl = downloadData.signedUrl;
    } catch (error) {
      console.error('[Version] Signed URL error:', error);
      return NextResponse.json({ error: 'Failed to generate download URL' }, { status: 500 });
    }

    // Fire-and-forget download recording
    recordDownload(skillId).catch(() => {});

    // Query 3: download count + scan verdict + findings in one query
    const metaRows = await db.execute(sql`
      SELECT
        coalesce((SELECT sum(count)::int FROM skill_download_daily WHERE skill_id = ${skillId} AND date >= CURRENT_DATE - 7), 0) AS "downloadCount",
        sr.verdict AS "scanVerdict",
        sf.stage AS "findingStage",
        sf.severity AS "findingSeverity",
        sf.type AS "findingType",
        sf.description AS "findingDescription",
        sf.location AS "findingLocation"
      FROM (SELECT 1) AS _dummy
      LEFT JOIN LATERAL (
        SELECT id, verdict FROM scan_results
        WHERE version_id = ${versionId}
        ORDER BY created_at DESC LIMIT 1
      ) sr ON true
      LEFT JOIN scan_findings sf ON sf.scan_id = sr.id
    `);

    const rawDownloadCount = metaRows.length > 0 ? Number((metaRows[0] as Record<string, unknown>).downloadCount) : 0;
    const downloadCount = Number.isFinite(rawDownloadCount) ? rawDownloadCount : 0;
    const scanVerdict =
      metaRows.length > 0 ? ((metaRows[0] as Record<string, unknown>).scanVerdict as string | null) : null;

    const scanFindingsList = metaRows
      .filter((r: Record<string, unknown>) => r.findingStage !== null)
      .map((r: Record<string, unknown>) => ({
        stage: r.findingStage as string,
        severity: r.findingSeverity as string,
        type: r.findingType as string,
        description: r.findingDescription as string,
        location: r.findingLocation as string | null
      }));

    const dependencies = (row.dependencies as Record<string, string> | null) ?? {};

    return NextResponse.json({
      name: row.name as string,
      version: row.version as string,
      description: row.description as string | null,
      integrity: row.integrity as string,
      permissions: row.permissions,
      auditScore: row.auditScore != null ? Number(row.auditScore) : null,
      auditStatus: row.auditStatus as string,
      downloadUrl: signedDownloadUrl,
      publishedAt: row.publishedAt as string,
      downloads: downloadCount,
      scanVerdict,
      scanFindings: scanFindingsList,
      dependencies
    });
  } catch (error) {
    console.error('[Version] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
