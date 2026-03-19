import { and, count, desc, eq, gte, lte } from 'drizzle-orm';
import { Hono } from 'hono';

import { db } from '~/lib/db';
import { auditEvents, user } from '~/lib/db/schema';

export const adminAuditLogsRoutes = new Hono().get('/', async (c) => {
  const page = Math.max(1, Number.parseInt(c.req.query('page') ?? '1', 10));
  const limit = Math.min(100, Math.max(1, Number.parseInt(c.req.query('limit') ?? '20', 10)));
  const offset = (page - 1) * limit;
  const action = c.req.query('action');
  const actorId = c.req.query('actorId');
  const targetType = c.req.query('targetType');
  const targetId = c.req.query('targetId');
  const startDate = c.req.query('startDate');
  const endDate = c.req.query('endDate');

  if (startDate && Number.isNaN(Date.parse(startDate))) {
    return c.json({ error: 'Invalid startDate' }, 400);
  }
  if (endDate && Number.isNaN(Date.parse(endDate))) {
    return c.json({ error: 'Invalid endDate' }, 400);
  }

  const conditions = [];
  if (action) conditions.push(eq(auditEvents.action, action));
  if (actorId) conditions.push(eq(auditEvents.actorId, actorId));
  if (targetType) conditions.push(eq(auditEvents.targetType, targetType));
  if (targetId) conditions.push(eq(auditEvents.targetId, targetId));
  if (startDate) conditions.push(gte(auditEvents.createdAt, new Date(startDate)));
  if (endDate) conditions.push(lte(auditEvents.createdAt, new Date(endDate)));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [totalRow] = await db.select({ count: count() }).from(auditEvents).where(where);
  const total = totalRow?.count ?? 0;

  const rows = await db
    .select({
      id: auditEvents.id,
      action: auditEvents.action,
      actorId: auditEvents.actorId,
      actorName: user.name,
      actorEmail: user.email,
      targetType: auditEvents.targetType,
      targetId: auditEvents.targetId,
      metadata: auditEvents.metadata,
      createdAt: auditEvents.createdAt
    })
    .from(auditEvents)
    .leftJoin(user, eq(auditEvents.actorId, user.id))
    .where(where)
    .orderBy(desc(auditEvents.createdAt))
    .limit(limit)
    .offset(offset);

  return c.json({ events: rows, total, page, limit, totalPages: Math.ceil(total / limit) });
});
