import { and, count, desc, eq, ilike, sql } from 'drizzle-orm';
import { Hono } from 'hono';

import { env } from '~/consts/env';
import { db } from '~/lib/db';
import { user } from '~/lib/db/auth-schema';
import { auditEvents, skills, skillVersions } from '~/lib/db/schema';
import { getStorageProvider } from '~/services/storage/provider';

export const packagesRoutes = new Hono()

  .get('/', async (c) => {
    const search = c.req.query('search');
    const status = c.req.query('status');
    const featured = c.req.query('featured');
    const page = Math.max(1, Number.parseInt(c.req.query('page') ?? '1', 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(c.req.query('limit') ?? '20', 10) || 20));
    const offset = (page - 1) * limit;

    const conditions = [];

    if (search) {
      conditions.push(ilike(skills.name, `%${search}%`));
    }
    if (status) {
      conditions.push(eq(skills.status, status));
    }
    if (featured === 'true') {
      conditions.push(eq(skills.featured, true));
    } else if (featured === 'false') {
      conditions.push(eq(skills.featured, false));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const latestVersion = db
      .select({
        skillId: skillVersions.skillId,
        version: skillVersions.version,
        auditScore: skillVersions.auditScore,
        auditStatus: skillVersions.auditStatus,
        createdAt: skillVersions.createdAt
      })
      .from(skillVersions)
      .where(
        sql`${skillVersions.createdAt} = (
          SELECT MAX(sv2.created_at) FROM skill_versions sv2 WHERE sv2.skill_id = ${skillVersions.skillId}
        )`
      )
      .as('latest_version');

    let query = db
      .select({
        id: skills.id,
        name: skills.name,
        description: skills.description,
        publisherId: skills.publisherId,
        publisherName: user.name,
        publisherEmail: user.email,
        orgId: skills.orgId,
        visibility: skills.visibility,
        status: skills.status,
        statusReason: skills.statusReason,
        featured: skills.featured,
        createdAt: skills.createdAt,
        updatedAt: skills.updatedAt,
        latestVersion: latestVersion.version,
        latestAuditScore: latestVersion.auditScore,
        latestAuditStatus: latestVersion.auditStatus,
        latestVersionDate: latestVersion.createdAt
      })
      .from(skills)
      .leftJoin(user, eq(skills.publisherId, user.id))
      .leftJoin(latestVersion, eq(skills.id, latestVersion.skillId))
      .$dynamic();

    if (where) {
      query = query.where(where);
    }

    const [packages, totalRows] = await Promise.all([
      query.orderBy(desc(skills.updatedAt)).offset(offset).limit(limit),
      db.select({ count: count() }).from(skills).where(where)
    ]);

    return c.json({ packages, total: totalRows[0].count, page, limit });
  })

  .patch('/:name{.+}', async (c) => {
    const name = decodeURIComponent(c.req.param('name'));
    const body = await c.req.json<{
      status?: string;
      statusReason?: string;
      featured?: boolean;
      visibility?: string;
    }>();

    const existing = await db.select({ id: skills.id }).from(skills).where(eq(skills.name, name)).limit(1);

    if (existing.length === 0) {
      return c.json({ error: 'Package not found' }, 404);
    }

    const adminUser = c.get('adminUser' as never) as { id: string };
    const updates: Record<string, unknown> = {};

    if (body.status !== undefined) {
      updates.status = body.status;
      updates.statusReason = body.statusReason ?? null;
      updates.statusChangedBy = adminUser.id;
      updates.statusChangedAt = new Date();
    }
    if (body.featured !== undefined) {
      updates.featured = body.featured;
      updates.featuredBy = body.featured ? adminUser.id : null;
      updates.featuredAt = body.featured ? new Date() : null;
    }
    if (body.visibility !== undefined) {
      updates.visibility = body.visibility;
    }

    if (Object.keys(updates).length === 0) {
      return c.json({ error: 'No valid fields to update' }, 400);
    }

    await db.update(skills).set(updates).where(eq(skills.name, name));

    await db.insert(auditEvents).values({
      action: 'admin.package.update',
      actorId: adminUser.id,
      targetType: 'skill',
      targetId: existing[0].id,
      metadata: { name, updates: body }
    });

    return c.json({ success: true });
  })

  .delete('/:name{.+}', async (c) => {
    const name = decodeURIComponent(c.req.param('name'));

    const existing = await db.select({ id: skills.id }).from(skills).where(eq(skills.name, name)).limit(1);

    if (existing.length === 0) {
      return c.json({ error: 'Package not found' }, 404);
    }

    const adminUser = c.get('adminUser' as never) as { id: string };

    await db.delete(skills).where(eq(skills.name, name));

    await db.insert(auditEvents).values({
      action: 'admin.package.delete',
      actorId: adminUser.id,
      targetType: 'skill',
      targetId: existing[0].id,
      metadata: { name }
    });

    return c.json({ success: true });
  })

  .post('/:name{.+}/rescan', async (c) => {
    const name = decodeURIComponent(c.req.param('name'));
    const scanApiUrl = env.PYTHON_API_URL;

    if (!scanApiUrl) {
      return c.json({ error: 'Scanner not configured' }, 503);
    }

    const rows = await db
      .select({
        skillId: skills.id,
        versionId: skillVersions.id,
        version: skillVersions.version,
        tarballPath: skillVersions.tarballPath,
        manifest: skillVersions.manifest,
        permissions: skillVersions.permissions
      })
      .from(skills)
      .innerJoin(skillVersions, eq(skillVersions.skillId, skills.id))
      .where(eq(skills.name, name))
      .orderBy(desc(skillVersions.createdAt))
      .limit(1);

    if (rows.length === 0) {
      return c.json({ error: 'Package or version not found' }, 404);
    }

    const row = rows[0];

    let signedUrl: string;
    try {
      const urlData = await getStorageProvider().createSignedUrl(row.tarballPath, 3600, 'internal');
      signedUrl = urlData.signedUrl;
    } catch {
      return c.json({ error: 'Failed to generate download URL for rescan' }, 500);
    }

    const scanResponse = await fetch(`${scanApiUrl}/api/analyze/scan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tarball_url: signedUrl,
        version_id: row.versionId,
        manifest: row.manifest,
        permissions: row.permissions
      })
    });

    if (!scanResponse.ok) {
      return c.json({ error: 'Scanner returned an error', status: scanResponse.status }, 502);
    }

    const adminUser = c.get('adminUser' as never) as { id: string };
    await db.insert(auditEvents).values({
      action: 'admin.package.rescan',
      actorId: adminUser.id,
      targetType: 'skill',
      targetId: row.skillId,
      metadata: { name, version: row.version, versionId: row.versionId }
    });

    return c.json({ queued: true, version: row.version });
  });
