import { and, count, desc, eq, ilike, sql } from 'drizzle-orm';
import { Hono } from 'hono';

import { db } from '~/lib/db';
import { user } from '~/lib/db/auth-schema';
import { auditEvents, skills, skillVersions } from '~/lib/db/schema';
import { runBulkRescan } from '~/lib/skills/bulk-rescan-db';
import { runRescan } from '~/lib/skills/rescan';

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

    const [skill] = await db.select({ id: skills.id }).from(skills).where(eq(skills.name, name)).limit(1);

    if (!skill) {
      return c.json({ error: 'Package not found' }, 404);
    }

    const adminUser = c.get('adminUser' as never) as { id: string };

    try {
      const result = await runRescan(skill.id, adminUser.id);
      return c.json(result);
    } catch (err) {
      return c.json({ error: (err as Error).message }, 502);
    }
  })

  .post('/rescan-many', async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as {
      status?: unknown;
      beforeScannedAt?: unknown;
      limit?: unknown;
      concurrency?: unknown;
      dryRun?: unknown;
    };

    const status = Array.isArray(body.status)
      ? (body.status.filter((s) => typeof s === 'string') as string[])
      : typeof body.status === 'string'
        ? [body.status]
        : undefined;

    let beforeScannedAt: Date | undefined;
    if (typeof body.beforeScannedAt === 'string') {
      const parsed = new Date(body.beforeScannedAt);
      if (Number.isNaN(parsed.getTime())) {
        return c.json({ error: 'beforeScannedAt must be a valid ISO 8601 date' }, 400);
      }
      beforeScannedAt = parsed;
    }

    const adminUser = c.get('adminUser' as never) as { id: string };

    try {
      const result = await runBulkRescan(
        {
          status,
          beforeScannedAt,
          limit: typeof body.limit === 'number' ? body.limit : undefined,
          concurrency: typeof body.concurrency === 'number' ? body.concurrency : undefined,
          dryRun: body.dryRun === true
        },
        adminUser.id
      );

      if (!result.dryRun) {
        await db.insert(auditEvents).values({
          action: 'admin.package.rescan_many',
          actorId: adminUser.id,
          targetType: 'skill',
          targetId: null,
          metadata: {
            matched: result.matched,
            rescanned: result.rescanned,
            remaining: result.remaining,
            filter: { status, beforeScannedAt: beforeScannedAt?.toISOString() ?? null }
          }
        });
      }

      return c.json(result);
    } catch (err) {
      return c.json({ error: (err as Error).message }, 502);
    }
  });
