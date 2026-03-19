import { count, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { Hono } from 'hono';

import { db } from '~/lib/db';
import { user, userStatus } from '~/lib/db/schema';

export const adminUsersRoutes = new Hono()
  .get('/', async (c) => {
    const page = Math.max(1, Number.parseInt(c.req.query('page') ?? '1', 10));
    const limit = Math.min(100, Math.max(1, Number.parseInt(c.req.query('limit') ?? '20', 10)));
    const offset = (page - 1) * limit;
    const search = c.req.query('search');
    const role = c.req.query('role');
    const status = c.req.query('status');

    const conditions = [];
    if (search) {
      conditions.push(or(ilike(user.name, `%${search}%`), ilike(user.email, `%${search}%`)));
    }
    if (role === 'admin' || role === 'user') {
      conditions.push(eq(user.role, role));
    }

    const where = conditions.length > 0 ? sql`${sql.join(conditions, sql` AND `)}` : undefined;

    const latestStatus = db
      .select({
        userId: userStatus.userId,
        status: userStatus.status,
        reason: userStatus.reason,
        createdAt: userStatus.createdAt,
        rn: sql<number>`ROW_NUMBER() OVER (PARTITION BY ${userStatus.userId} ORDER BY ${userStatus.createdAt} DESC)`.as(
          'rn'
        )
      })
      .from(userStatus)
      .as('latest_status');

    const [totalRow] = await db.select({ count: count() }).from(user).where(where);
    const total = totalRow?.count ?? 0;

    const rows = await db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        emailVerified: user.emailVerified,
        createdAt: user.createdAt,
        status: latestStatus.status,
        statusReason: latestStatus.reason
      })
      .from(user)
      .leftJoin(latestStatus, sql`${latestStatus.userId} = ${user.id} AND ${latestStatus.rn} = 1`)
      .where(where)
      .orderBy(desc(user.createdAt))
      .limit(limit)
      .offset(offset);

    if (status) {
      const filtered = rows.filter((r) => (r.status ?? 'active') === status);
      return c.json({
        users: filtered,
        total: filtered.length,
        page,
        limit,
        totalPages: Math.ceil(filtered.length / limit)
      });
    }

    return c.json({
      users: rows,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    });
  })

  .get('/:userId', async (c) => {
    const userId = c.req.param('userId');
    const [row] = await db.select().from(user).where(eq(user.id, userId)).limit(1);
    if (!row) return c.json({ error: 'User not found' }, 404);

    const statuses = await db
      .select()
      .from(userStatus)
      .where(eq(userStatus.userId, userId))
      .orderBy(desc(userStatus.createdAt))
      .limit(10);

    return c.json({ user: row, statuses });
  })

  .patch('/:userId/status', async (c) => {
    const userId = c.req.param('userId');
    const body = await c.req.json<{ status: string; reason?: string }>();
    const validStatuses = ['active', 'suspended', 'banned'];
    if (!validStatuses.includes(body.status)) {
      return c.json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` }, 400);
    }

    const [existing] = await db.select({ id: user.id }).from(user).where(eq(user.id, userId)).limit(1);
    if (!existing) return c.json({ error: 'User not found' }, 404);

    const { getSessionFromRequest } = await import('~/lib/auth/authz');
    const session = await getSessionFromRequest(c.req.raw);
    const adminUserId = session?.user?.id ?? 'unknown';

    const [record] = await db
      .insert(userStatus)
      .values({
        userId,
        status: body.status,
        reason: body.reason ?? null,
        bannedBy: adminUserId
      })
      .returning();

    return c.json({ ok: true, statusRecord: record });
  });
