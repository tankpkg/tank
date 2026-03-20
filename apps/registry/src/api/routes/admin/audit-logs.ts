import { and, count, desc, eq, gte, lte } from 'drizzle-orm';
import { Hono } from 'hono';

import { db } from '~/lib/db';
import { auditEvents } from '~/lib/db/schema';

export const auditLogsRoutes = new Hono().get('/', async (c) => {
  const action = c.req.query('action');
  const actorId = c.req.query('actorId');
  const targetType = c.req.query('targetType');
  const targetId = c.req.query('targetId');
  const from = c.req.query('from');
  const to = c.req.query('to');
  const page = Math.max(1, Number.parseInt(c.req.query('page') ?? '1', 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(c.req.query('limit') ?? '50', 10) || 50));
  const offset = (page - 1) * limit;

  const conditions = [];

  if (action) {
    conditions.push(eq(auditEvents.action, action));
  }
  if (actorId) {
    conditions.push(eq(auditEvents.actorId, actorId));
  }
  if (targetType) {
    conditions.push(eq(auditEvents.targetType, targetType));
  }
  if (targetId) {
    conditions.push(eq(auditEvents.targetId, targetId));
  }
  if (from) {
    conditions.push(gte(auditEvents.createdAt, new Date(from)));
  }
  if (to) {
    conditions.push(lte(auditEvents.createdAt, new Date(to)));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [events, totalRows] = await Promise.all([
    db.select().from(auditEvents).where(where).orderBy(desc(auditEvents.createdAt)).offset(offset).limit(limit),
    db.select({ count: count() }).from(auditEvents).where(where)
  ]);

  return c.json({ events, total: totalRows[0].count, page, limit });
});
