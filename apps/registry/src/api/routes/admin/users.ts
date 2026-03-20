import { and, count, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { Hono } from 'hono';

import { db } from '~/lib/db';
import { user } from '~/lib/db/auth-schema';
import { auditEvents, userStatus } from '~/lib/db/schema';

export const usersRoutes = new Hono()

  .get('/', async (c) => {
    const search = c.req.query('search');
    const role = c.req.query('role');
    const status = c.req.query('status');
    const page = Math.max(1, Number.parseInt(c.req.query('page') ?? '1', 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(c.req.query('limit') ?? '20', 10) || 20));
    const offset = (page - 1) * limit;

    const conditions = [];

    if (search) {
      conditions.push(or(ilike(user.name, `%${search}%`), ilike(user.email, `%${search}%`)));
    }
    if (role) {
      conditions.push(eq(user.role, role));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    // Subquery for latest user status
    const latestStatus = db
      .select({
        userId: userStatus.userId,
        status: userStatus.status,
        reason: userStatus.reason,
        expiresAt: userStatus.expiresAt
      })
      .from(userStatus)
      .where(
        sql`${userStatus.createdAt} = (
          SELECT MAX(us2.created_at) FROM user_status us2 WHERE us2.user_id = ${userStatus.userId}
        )`
      )
      .as('latest_status');

    let query = db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        emailVerified: user.emailVerified,
        image: user.image,
        githubUsername: user.githubUsername,
        role: user.role,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        moderationStatus: latestStatus.status,
        moderationReason: latestStatus.reason,
        moderationExpiresAt: latestStatus.expiresAt
      })
      .from(user)
      .leftJoin(latestStatus, eq(user.id, latestStatus.userId))
      .$dynamic();

    if (where) {
      query = query.where(where);
    }

    if (status) {
      if (status === 'active') {
        query = query.where(or(sql`${latestStatus.status} IS NULL`, eq(latestStatus.status, 'active')));
      } else {
        query = query.where(eq(latestStatus.status, status));
      }
    }

    const [users, totalRows] = await Promise.all([
      query.orderBy(desc(user.createdAt)).offset(offset).limit(limit),
      db.select({ count: count() }).from(user).where(where)
    ]);

    return c.json({ users, total: totalRows[0].count, page, limit });
  })

  .patch('/:id', async (c) => {
    const id = c.req.param('id');
    const body = await c.req.json<{ role: 'user' | 'admin' }>();

    if (!body.role || !['user', 'admin'].includes(body.role)) {
      return c.json({ error: 'Invalid role. Must be "user" or "admin"' }, 400);
    }

    const existing = await db.select({ id: user.id }).from(user).where(eq(user.id, id)).limit(1);
    if (existing.length === 0) {
      return c.json({ error: 'User not found' }, 404);
    }

    await db.update(user).set({ role: body.role }).where(eq(user.id, id));

    const adminUser = c.get('adminUser' as never) as { id: string };
    await db.insert(auditEvents).values({
      action: 'admin.user.role_update',
      actorId: adminUser.id,
      targetType: 'user',
      targetId: id,
      metadata: { role: body.role }
    });

    return c.json({ success: true });
  })

  .post('/:id/status', async (c) => {
    const id = c.req.param('id');
    const body = await c.req.json<{ status: string; reason?: string; expiresAt?: string }>();

    if (!body.status || !['active', 'suspended', 'banned'].includes(body.status)) {
      return c.json({ error: 'Invalid status. Must be "active", "suspended", or "banned"' }, 400);
    }

    const existing = await db.select({ id: user.id }).from(user).where(eq(user.id, id)).limit(1);
    if (existing.length === 0) {
      return c.json({ error: 'User not found' }, 404);
    }

    const adminUser = c.get('adminUser' as never) as { id: string };

    await db.insert(userStatus).values({
      userId: id,
      status: body.status,
      reason: body.reason ?? null,
      bannedBy: adminUser.id,
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : null
    });

    await db.insert(auditEvents).values({
      action: `admin.user.status_${body.status}`,
      actorId: adminUser.id,
      targetType: 'user',
      targetId: id,
      metadata: { status: body.status, reason: body.reason ?? null }
    });

    return c.json({ success: true });
  });
