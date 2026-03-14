import { sql } from 'drizzle-orm';
import { Hono } from 'hono';

import { resolveRequestUserId } from '~/lib/auth-helpers';
import { db } from '~/lib/db';
import { skills } from '~/lib/db/schema';
import { getStorageProvider } from '~/lib/storage/provider';

function visibilityClause(requesterUserId: string | null) {
  if (!requesterUserId) {
    return sql`s.visibility = 'public'`;
  }

  return sql`(
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
  )`;
}

async function recordDownload(skillId: string): Promise<void> {
  await db.execute(sql`
    INSERT INTO skill_download_daily (id, skill_id, date, count)
    VALUES (gen_random_uuid(), ${skillId}, CURRENT_DATE, 1)
    ON CONFLICT (skill_id, date) DO UPDATE SET count = skill_download_daily.count + 1
  `);
}

export const skillsReadRoutes = new Hono();

// GET /skills/:name — single skill metadata with latest version
skillsReadRoutes.get('/:name', async (c) => {
  const requesterUserId = await resolveRequestUserId(c.req.raw);
  const rawName = c.req.param('name');
  const name = decodeURIComponent(rawName);
  const visClause = visibilityClause(requesterUserId);

  const results = await db.execute(sql`
    SELECT
      s.name,
      s.description,
      s.visibility,
      sv.version AS "latestVersion",
      coalesce(u.name, '') AS "publisherName",
      s.created_at AS "createdAt",
      s.updated_at AS "updatedAt"
    FROM ${skills} s
    LEFT JOIN "user" u ON u.id = s.publisher_id
    LEFT JOIN skill_versions sv ON sv.skill_id = s.id
      AND sv.created_at = (
        SELECT MAX(sv2.created_at) FROM skill_versions sv2 WHERE sv2.skill_id = s.id
      )
    WHERE s.name = ${name} AND ${visClause}
    LIMIT 1
  `);

  if (results.length === 0) {
    return c.json({ error: 'Skill not found' }, 404);
  }

  const row = results[0] as Record<string, unknown>;

  return c.json({
    name: row.name as string,
    description: row.description as string | null,
    visibility: row.visibility as 'public' | 'private',
    latestVersion: (row.latestVersion as string) ?? null,
    publisher: {
      name: (row.publisherName as string) || null
    },
    createdAt: row.createdAt as string,
    updatedAt: row.updatedAt as string
  });
});

// GET /skills/:name/versions — all versions for a skill
skillsReadRoutes.get('/:name/versions', async (c) => {
  const requesterUserId = await resolveRequestUserId(c.req.raw);
  const rawName = c.req.param('name');
  const name = decodeURIComponent(rawName);
  const visClause = visibilityClause(requesterUserId);

  const rows = await db.execute(sql`
    SELECT
      s.name,
      sv.version,
      sv.integrity,
      sv.audit_score AS "auditScore",
      sv.audit_status AS "auditStatus",
      sv.created_at AS "publishedAt"
    FROM ${skills} s
    LEFT JOIN skill_versions sv ON sv.skill_id = s.id
    WHERE s.name = ${name} AND ${visClause}
    ORDER BY sv.created_at DESC
  `);

  if (rows.length === 0) {
    return c.json({ error: 'Skill not found' }, 404);
  }

  const skillName = (rows[0] as Record<string, unknown>).name as string;

  return c.json({
    name: skillName,
    versions: rows
      .filter(
        (r: Record<string, unknown>) =>
          r.version !== null && r.integrity !== 'pending' && r.auditStatus !== 'pending-upload'
      )
      .map((r: Record<string, unknown>) => ({
        version: r.version as string,
        integrity: r.integrity as string,
        auditScore: r.auditScore != null ? Number(r.auditScore) : null,
        auditStatus: r.auditStatus as string,
        publishedAt: r.publishedAt as string
      }))
  });
});

// GET /skills/:name/:version — specific version detail with download URL
skillsReadRoutes.get('/:name/:version', async (c) => {
  try {
    const requesterUserId = await resolveRequestUserId(c.req.raw);
    const rawName = c.req.param('name');
    const version = c.req.param('version');
    const name = decodeURIComponent(rawName);
    const visClause = visibilityClause(requesterUserId);

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
      WHERE s.name = ${name} AND ${visClause}
      LIMIT 1
    `);

    if (skillVersionRows.length === 0) {
      const skillCheck = await db.execute(sql`
        SELECT s.id
        FROM skills s
        WHERE s.name = ${name} AND ${visClause}
        LIMIT 1
      `);

      if (skillCheck.length === 0) {
        return c.json({ error: 'Skill not found' }, 404);
      }
      return c.json({ error: `Version ${version} not found for ${name}` }, 404);
    }

    const row = skillVersionRows[0] as Record<string, unknown>;
    const skillId = row.skillId as string;
    const versionId = row.versionId as string;
    const tarballPath = row.tarballPath as string;

    let signedDownloadUrl: string;
    try {
      const downloadData = await getStorageProvider().createSignedUrl(tarballPath, 3600);
      signedDownloadUrl = downloadData.signedUrl;
    } catch {
      return c.json({ error: 'Failed to generate download URL' }, 500);
    }

    // Fire-and-forget download recording
    recordDownload(skillId).catch(() => {});

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

    return c.json({
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
    return c.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      500
    );
  }
});
