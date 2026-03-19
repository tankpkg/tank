import { count, desc, eq, ilike, sql } from 'drizzle-orm';
import { Hono } from 'hono';

import { db } from '~/lib/db';
import { skillDownloadDaily, skills, skillVersions, user } from '~/lib/db/schema';

const VALID_STATUSES = ['active', 'deprecated', 'quarantined', 'removed'];

export const adminPackagesRoutes = new Hono()
  .get('/', async (c) => {
    const page = Math.max(1, Number.parseInt(c.req.query('page') ?? '1', 10));
    const limit = Math.min(100, Math.max(1, Number.parseInt(c.req.query('limit') ?? '20', 10)));
    const offset = (page - 1) * limit;
    const search = c.req.query('search');
    const status = c.req.query('status');
    const featured = c.req.query('featured');

    if (status && !VALID_STATUSES.includes(status)) {
      return c.json({ error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` }, 400);
    }

    const conditions = [];
    if (search) conditions.push(ilike(skills.name, `%${search}%`));
    if (status) conditions.push(eq(skills.status, status));
    if (featured === 'true') conditions.push(eq(skills.featured, true));
    if (featured === 'false') conditions.push(eq(skills.featured, false));

    const where = conditions.length > 0 ? sql`${sql.join(conditions, sql` AND `)}` : undefined;

    const [totalRow] = await db.select({ count: count() }).from(skills).where(where);
    const total = totalRow?.count ?? 0;

    const rows = await db
      .select({
        id: skills.id,
        name: skills.name,
        description: skills.description,
        status: skills.status,
        visibility: skills.visibility,
        featured: skills.featured,
        publisherId: skills.publisherId,
        publisherName: user.name,
        publisherEmail: user.email,
        createdAt: skills.createdAt,
        updatedAt: skills.updatedAt
      })
      .from(skills)
      .leftJoin(user, eq(skills.publisherId, user.id))
      .where(where)
      .orderBy(desc(skills.createdAt))
      .limit(limit)
      .offset(offset);

    const enriched = await Promise.all(
      rows.map(async (row) => {
        const [[versions], [downloads]] = await Promise.all([
          db.select({ count: count() }).from(skillVersions).where(eq(skillVersions.skillId, row.id)),
          db
            .select({ total: sql<number>`COALESCE(SUM(${skillDownloadDaily.count}), 0)` })
            .from(skillDownloadDaily)
            .where(eq(skillDownloadDaily.skillId, row.id))
        ]);
        return { ...row, versionCount: versions?.count ?? 0, downloadCount: Number(downloads?.total ?? 0) };
      })
    );

    return c.json({ packages: enriched, total, page, limit, totalPages: Math.ceil(total / limit) });
  })

  .get('/:name{.+}', async (c) => {
    const name = c.req.param('name');
    const [pkg] = await db.select().from(skills).where(eq(skills.name, name)).limit(1);
    if (!pkg) return c.json({ error: 'Package not found' }, 404);

    const versions = await db
      .select()
      .from(skillVersions)
      .where(eq(skillVersions.skillId, pkg.id))
      .orderBy(desc(skillVersions.createdAt));

    const [downloads] = await db
      .select({ total: sql<number>`COALESCE(SUM(${skillDownloadDaily.count}), 0)` })
      .from(skillDownloadDaily)
      .where(eq(skillDownloadDaily.skillId, pkg.id));

    return c.json({ package: pkg, versions, downloadCount: Number(downloads?.total ?? 0) });
  })

  .patch('/:name{.+}/status', async (c) => {
    const name = c.req.param('name');
    const body = await c.req.json<{ status: string }>();

    if (!VALID_STATUSES.includes(body.status)) {
      return c.json({ error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` }, 400);
    }

    const [pkg] = await db.select({ id: skills.id }).from(skills).where(eq(skills.name, name)).limit(1);
    if (!pkg) return c.json({ error: 'Package not found' }, 404);

    await db.update(skills).set({ status: body.status }).where(eq(skills.id, pkg.id));
    return c.json({ ok: true });
  });
