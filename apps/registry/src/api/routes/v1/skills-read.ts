import { createGunzip } from 'node:zlib';
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { sql } from 'drizzle-orm';
import { extract } from 'tar-stream';

import { resolveRequestUserId } from '~/lib/auth/authz';
import { db } from '~/lib/db';
import { skills } from '~/lib/db/schema';
import { visibilityClause } from '~/lib/db/visibility';
import { apiLog } from '~/services/logger';
import { getStorageProvider } from '~/services/storage/provider';

function extractFileFromTarball(tarball: Uint8Array, targetPath: string): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const extractor = extract();
    const gunzip = createGunzip();
    let found = false;

    extractor.on('entry', (header, stream, next) => {
      const raw = header.name;
      const stripped = raw.replace(/^[^/]+\//, '');
      if (raw === targetPath || stripped === targetPath) {
        const chunks: Buffer[] = [];
        stream.on('data', (chunk: Buffer) => chunks.push(chunk));
        stream.on('end', () => {
          found = true;
          resolve(Buffer.concat(chunks).toString('utf-8'));
        });
      } else {
        stream.resume();
      }
      stream.on('end', next);
    });

    extractor.on('finish', () => {
      if (!found) resolve(null);
    });

    extractor.on('error', reject);
    gunzip.on('error', reject);

    gunzip.pipe(extractor);
    gunzip.end(Buffer.from(tarball));
  });
}

async function recordDownload(skillId: string): Promise<void> {
  await db.execute(sql`
    INSERT INTO skill_download_daily (id, skill_id, date, count)
    VALUES (gen_random_uuid(), ${skillId}, CURRENT_DATE, 1)
    ON CONFLICT (skill_id, date) DO UPDATE SET count = skill_download_daily.count + 1
  `);
}

const nameParam = z.object({
  name: z.string().openapi({ description: 'Skill name (URL-encoded)', example: '@tank/react' })
});

const nameVersionParam = z.object({
  name: z.string().openapi({ description: 'Skill name (URL-encoded)', example: '@tank/react' }),
  version: z.string().openapi({ description: 'Semver version', example: '1.0.0' })
});

const errorSchema = z.object({ error: z.string() });

const getSkillRoute = createRoute({
  method: 'get',
  path: '/{name}',
  tags: ['Skills'],
  summary: 'Get skill metadata',
  description: 'Returns metadata for a skill including its latest version.',
  request: { params: nameParam },
  responses: {
    200: {
      description: 'Skill metadata',
      content: {
        'application/json': {
          schema: z.object({
            name: z.string(),
            description: z.string().nullable(),
            visibility: z.enum(['public', 'private']),
            latestVersion: z.string().nullable(),
            publisher: z.object({ name: z.string().nullable() }),
            createdAt: z.string(),
            updatedAt: z.string()
          })
        }
      }
    },
    404: {
      description: 'Skill not found',
      content: { 'application/json': { schema: errorSchema } }
    }
  }
});

const getVersionsRoute = createRoute({
  method: 'get',
  path: '/{name}/versions',
  tags: ['Skills'],
  summary: 'List skill versions',
  description: 'Returns all published versions for a skill.',
  request: { params: nameParam },
  responses: {
    200: {
      description: 'Version list',
      content: {
        'application/json': {
          schema: z.object({
            name: z.string(),
            versions: z.array(
              z.object({
                version: z.string(),
                integrity: z.string(),
                auditScore: z.number().nullable(),
                auditStatus: z.string(),
                publishedAt: z.string()
              })
            )
          })
        }
      }
    },
    404: {
      description: 'Skill not found',
      content: { 'application/json': { schema: errorSchema } }
    }
  }
});

const getVersionDetailRoute = createRoute({
  method: 'get',
  path: '/{name}/{version}',
  tags: ['Skills'],
  summary: 'Get version detail',
  description: 'Returns full detail for a specific skill version including a signed download URL.',
  request: { params: nameVersionParam },
  responses: {
    200: {
      description: 'Version detail with download URL',
      content: {
        'application/json': {
          schema: z.object({
            name: z.string(),
            version: z.string(),
            description: z.string().nullable(),
            integrity: z.string(),
            permissions: z.any(),
            auditScore: z.number().nullable(),
            auditStatus: z.string(),
            downloadUrl: z.string(),
            publishedAt: z.string(),
            downloads: z.number(),
            scanVerdict: z.string().nullable(),
            scanFindings: z.array(z.any()),
            dependencies: z.record(z.string(), z.string())
          })
        }
      }
    },
    404: {
      description: 'Skill or version not found',
      content: { 'application/json': { schema: errorSchema } }
    },
    500: {
      description: 'Internal server error',
      content: {
        'application/json': {
          schema: z.object({ error: z.string(), details: z.string().optional() })
        }
      }
    }
  }
});

export const skillsReadRoutes = new OpenAPIHono()

  .openapi(getSkillRoute, async (c) => {
    const requesterUserId = await resolveRequestUserId(c.req.raw);
    const { name: rawName } = c.req.valid('param');
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

    return c.json(
      {
        name: row.name as string,
        description: row.description as string | null,
        visibility: row.visibility as 'public' | 'private',
        latestVersion: (row.latestVersion as string) ?? null,
        publisher: {
          name: (row.publisherName as string) || null
        },
        createdAt: row.createdAt as string,
        updatedAt: row.updatedAt as string
      },
      200
    );
  })

  .openapi(getVersionsRoute, async (c) => {
    const requesterUserId = await resolveRequestUserId(c.req.raw);
    const { name: rawName } = c.req.valid('param');
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

    return c.json(
      {
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
      },
      200
    );
  })

  .openapi(getVersionDetailRoute, async (c) => {
    try {
      const requesterUserId = await resolveRequestUserId(c.req.raw);
      const { name: rawName, version } = c.req.valid('param');
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

      recordDownload(skillId).catch((err) => apiLog.warn({ err, skillId }, 'download recording failed'));

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

      return c.json(
        {
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
        },
        200
      );
    } catch (error) {
      return c.json(
        { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
        500
      );
    }
  })

  .get('/:name/:version/files/*', async (c) => {
    try {
      const name = decodeURIComponent(c.req.param('name'));
      const version = c.req.param('version');
      const rawUrl = new URL(c.req.url);
      const pathParts = rawUrl.pathname.split('/files/');
      const filePath = pathParts.length > 1 ? decodeURIComponent(pathParts[pathParts.length - 1]) : '';

      if (!filePath || filePath.includes('..')) {
        return c.json({ error: 'Invalid file path' }, 400);
      }

      const rows = await db.execute(sql`
        SELECT sv.tarball_path AS "tarballPath"
        FROM skills s
        INNER JOIN skill_versions sv ON sv.skill_id = s.id AND sv.version = ${version}
        WHERE s.name = ${name}
        LIMIT 1
      `);

      if (rows.length === 0) {
        return c.json({ error: 'Skill version not found' }, 404);
      }

      const tarballPath = (rows[0] as Record<string, unknown>).tarballPath as string;

      let tarballBytes: Uint8Array;
      try {
        tarballBytes = await getStorageProvider().getObject(tarballPath);
      } catch (err) {
        apiLog.warn({ err, tarballPath }, 'failed to download tarball for file extraction');
        return c.json({ error: 'Not found' }, 404);
      }

      const fileContent = await extractFileFromTarball(tarballBytes, filePath);
      if (fileContent === null) {
        return c.json({ error: 'File not found in package' }, 404);
      }

      return c.text(fileContent);
    } catch (error) {
      apiLog.error({ error }, 'file extraction failed');
      return c.json({ error: 'Internal server error' }, 500);
    }
  });
