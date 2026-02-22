import { NextRequest, NextResponse } from 'next/server';
import { and, count, desc, eq, gte, lte } from 'drizzle-orm';
import { withAdminAuth } from '@/lib/admin-middleware';
import { db } from '@/lib/db';
import { auditEvents, user } from '@/lib/db/schema';

export const GET = withAdminAuth<unknown>(async (req: NextRequest) => {
  const url = new URL(req.url);
  const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') ?? '20', 10) || 20));
  const action = url.searchParams.get('action') ?? undefined;
  const actorId = url.searchParams.get('actorId') ?? undefined;
  const targetType = url.searchParams.get('targetType') ?? undefined;
  const targetId = url.searchParams.get('targetId') ?? undefined;
  const startDate = url.searchParams.get('startDate') ?? undefined;
  const endDate = url.searchParams.get('endDate') ?? undefined;
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
  if (startDate) {
    const parsed = new Date(startDate);
    if (Number.isNaN(parsed.getTime())) {
      return NextResponse.json({ error: 'Invalid startDate' }, { status: 400 });
    }
    conditions.push(gte(auditEvents.createdAt, parsed));
  }
  if (endDate) {
    const parsed = new Date(endDate);
    if (Number.isNaN(parsed.getTime())) {
      return NextResponse.json({ error: 'Invalid endDate' }, { status: 400 });
    }
    conditions.push(lte(auditEvents.createdAt, parsed));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [totalResult] = await db.select({ count: count() }).from(auditEvents).where(whereClause);
  const total = totalResult?.count ?? 0;

  const events = await db
    .select({
      id: auditEvents.id,
      action: auditEvents.action,
      actorId: auditEvents.actorId,
      actorName: user.name,
      actorEmail: user.email,
      targetType: auditEvents.targetType,
      targetId: auditEvents.targetId,
      metadata: auditEvents.metadata,
      createdAt: auditEvents.createdAt,
    })
    .from(auditEvents)
    .leftJoin(user, eq(auditEvents.actorId, user.id))
    .where(whereClause)
    .orderBy(desc(auditEvents.createdAt))
    .limit(limit)
    .offset(offset);

  return NextResponse.json({
    events,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  });
});
