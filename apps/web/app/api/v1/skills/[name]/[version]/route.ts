import { NextResponse } from 'next/server';
import { eq, and, sql, desc } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import { db } from '@/lib/db';
import { skills, skillVersions, skillDownloads, scanResults, scanFindings } from '@/lib/db/schema';
import { supabaseAdmin } from '@/lib/supabase';

async function recordDownload(
  request: Request,
  skillId: string,
  versionId: string,
): Promise<void> {
  const forwarded = request.headers.get('x-forwarded-for');
  const ip = forwarded?.split(',')[0]?.trim() ?? 'unknown';
  const ipHash = createHash('sha256').update(ip).digest('hex');

  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const existing = await db
    .select({ id: skillDownloads.id })
    .from(skillDownloads)
    .where(
      and(
        eq(skillDownloads.skillId, skillId),
        eq(skillDownloads.ipHash, ipHash),
        sql`${skillDownloads.createdAt} > ${oneHourAgo}`,
      ),
    )
    .limit(1);

  if (existing.length > 0) return;

  await db.insert(skillDownloads).values({
    skillId,
    versionId,
    ipHash,
    userAgent: request.headers.get('user-agent') ?? null,
  });
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
export async function GET(
  request: Request,
  { params }: { params: Promise<{ name: string; version: string }> },
) {
  try {
    const { name: rawName, version } = await params;
    const name = decodeURIComponent(rawName);

    // Query 1: skill + version in one shot
    const skillVersionRows = await db.execute(sql`
      SELECT
        s.id AS "skillId",
        s.name,
        s.description,
        sv.id AS "versionId",
        sv.version,
        sv.integrity,
        sv.permissions,
        sv.audit_score AS "auditScore",
        sv.audit_status AS "auditStatus",
        sv.tarball_path AS "tarballPath",
        sv.created_at AS "publishedAt"
      FROM skills s
      INNER JOIN skill_versions sv ON sv.skill_id = s.id AND sv.version = ${version}
      WHERE s.name = ${name}
      LIMIT 1
    `);

    if (skillVersionRows.length === 0) {
      // Distinguish skill-not-found vs version-not-found
      const skillCheck = await db
        .select({ id: skills.id })
        .from(skills)
        .where(eq(skills.name, name))
        .limit(1);

      if (skillCheck.length === 0) {
        return NextResponse.json({ error: 'Skill not found' }, { status: 404 });
      }
      return NextResponse.json(
        { error: `Version ${version} not found for ${name}` },
        { status: 404 },
      );
    }

    const row = skillVersionRows[0] as Record<string, unknown>;
    const skillId = row.skillId as string;
    const versionId = row.versionId as string;
    const tarballPath = row.tarballPath as string;

    // Query 2: Supabase signed URL (external, cannot consolidate)
    const { data: downloadData, error: downloadError } = await supabaseAdmin.storage
      .from('packages')
      .createSignedUrl(tarballPath, 3600);

    if (downloadError || !downloadData) {
      console.error('[Version] Supabase signed URL error:', downloadError);
      return NextResponse.json(
        { error: 'Failed to generate download URL', details: downloadError?.message },
        { status: 500 },
      );
    }

    // Fire-and-forget download recording
    recordDownload(request, skillId, versionId).catch(() => {});

    // Query 3: download count + scan verdict + findings in one query
    const metaRows = await db.execute(sql`
      SELECT
        (SELECT count(*)::int FROM skill_downloads WHERE skill_id = ${skillId}) AS "downloadCount",
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

    const rawDownloadCount = metaRows.length > 0
      ? Number((metaRows[0] as Record<string, unknown>).downloadCount)
      : 0;
    const downloadCount = Number.isFinite(rawDownloadCount) ? rawDownloadCount : 0;
    const scanVerdict = metaRows.length > 0 ? ((metaRows[0] as Record<string, unknown>).scanVerdict as string | null) : null;

    const scanFindingsList = metaRows
      .filter((r: Record<string, unknown>) => r.findingStage !== null)
      .map((r: Record<string, unknown>) => ({
        stage: r.findingStage as string,
        severity: r.findingSeverity as string,
        type: r.findingType as string,
        description: r.findingDescription as string,
        location: (r.findingLocation as string | null),
      }));

    return NextResponse.json({
      name: row.name as string,
      version: row.version as string,
      description: row.description as string | null,
      integrity: row.integrity as string,
      permissions: row.permissions,
      auditScore: row.auditScore != null ? Number(row.auditScore) : null,
      auditStatus: row.auditStatus as string,
      downloadUrl: downloadData.signedUrl,
      publishedAt: row.publishedAt as string,
      downloads: downloadCount,
      scanVerdict,
      scanFindings: scanFindingsList,
    });
  } catch (error) {
    console.error('[Version] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
