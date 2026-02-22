import { NextRequest, NextResponse } from 'next/server';
import { eq, desc, sql } from 'drizzle-orm';
import { skillStatusSchema } from '@tank/shared';
import { withAdminAuth, type AdminAuthContext } from '@/lib/admin-middleware';
import { db } from '@/lib/db';
import { skills, skillVersions, skillDownloads, auditEvents } from '@/lib/db/schema';
import { user } from '@/lib/db/auth-schema';

// Vercel CDN decodes %2F → / in URL paths, so scoped packages like
// @tank/skill-creator arrive as multiple segments. This catch-all collects
// them and splits off trailing action keywords (feature, status).
type RouteParams = { params: Promise<{ segments: string[] }> };

const ACTIONS = new Set(['feature', 'status']);

function parseSegments(segments: string[]): { name: string; action: string | undefined } {
  const last = segments[segments.length - 1];
  if (segments.length >= 2 && ACTIONS.has(last)) {
    return { name: segments.slice(0, -1).join('/'), action: last };
  }
  return { name: segments.join('/'), action: undefined };
}

async function getSegments(routeCtx: RouteParams | undefined): Promise<string[]> {
  if (!routeCtx) throw new Error('Missing route context');
  return (await routeCtx.params).segments;
}

async function handleGetDetail(name: string): Promise<NextResponse> {
  const [skill] = await db
    .select()
    .from(skills)
    .where(eq(skills.name, name))
    .limit(1);

  if (!skill) {
    return NextResponse.json({ error: 'Package not found' }, { status: 404 });
  }

  const [publisher] = await db
    .select({ id: user.id, name: user.name, email: user.email, githubUsername: user.githubUsername })
    .from(user)
    .where(eq(user.id, skill.publisherId))
    .limit(1);

  const versions = await db
    .select()
    .from(skillVersions)
    .where(eq(skillVersions.skillId, skill.id))
    .orderBy(desc(skillVersions.createdAt));

  const downloadCountResult = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(skillDownloads)
    .where(eq(skillDownloads.skillId, skill.id));
  const downloadCount = downloadCountResult[0]?.count ?? 0;

  const statusHistory = await db
    .select()
    .from(auditEvents)
    .where(eq(auditEvents.targetId, skill.id))
    .orderBy(desc(auditEvents.createdAt))
    .limit(50);

  const filteredHistory = statusHistory.filter(
    (event) => event.targetType === 'skill',
  );

  return NextResponse.json({
    package: {
      ...skill,
      publisher: publisher ?? null,
      versions,
      downloadCount,
      statusHistory: filteredHistory,
    },
  });
}

async function handleDelete(name: string, adminUser: AdminAuthContext['user']): Promise<NextResponse> {
  const [skill] = await db
    .select({ id: skills.id, name: skills.name, status: skills.status })
    .from(skills)
    .where(eq(skills.name, name))
    .limit(1);

  if (!skill) {
    return NextResponse.json({ error: 'Package not found' }, { status: 404 });
  }

  const previousStatus = skill.status;

  await db.transaction(async (tx) => {
    await tx
      .update(skills)
      .set({
        status: 'removed',
        statusReason: 'Removed by admin',
        statusChangedBy: adminUser.id,
        statusChangedAt: new Date(),
      })
      .where(eq(skills.id, skill.id));

    await tx.insert(auditEvents).values({
      action: 'skill.remove',
      actorId: adminUser.id,
      targetType: 'skill',
      targetId: skill.id,
      metadata: { reason: 'Removed by admin', previousStatus },
    });
  });

  return NextResponse.json({ success: true, name: skill.name, status: 'removed' });
}

async function handleFeature(name: string, req: NextRequest, adminUser: AdminAuthContext['user']): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (typeof body !== 'object' || body === null) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { featured } = body as Record<string, unknown>;

  if (typeof featured !== 'boolean') {
    return NextResponse.json(
      { error: 'featured must be a boolean' },
      { status: 400 },
    );
  }

  const [skill] = await db
    .select({ id: skills.id, name: skills.name, featured: skills.featured })
    .from(skills)
    .where(eq(skills.name, name))
    .limit(1);

  if (!skill) {
    return NextResponse.json({ error: 'Package not found' }, { status: 404 });
  }

  await db.transaction(async (tx) => {
    await tx
      .update(skills)
      .set({
        featured,
        featuredBy: featured ? adminUser.id : null,
        featuredAt: featured ? new Date() : null,
      })
      .where(eq(skills.id, skill.id));

    await tx.insert(auditEvents).values({
      action: featured ? 'skill.feature' : 'skill.unfeature',
      actorId: adminUser.id,
      targetType: 'skill',
      targetId: skill.id,
      metadata: { featured },
    });
  });

  return NextResponse.json({
    success: true,
    name: skill.name,
    featured,
  });
}

const statusActionMap: Record<string, string> = {
  quarantined: 'skill.quarantine',
  removed: 'skill.remove',
  deprecated: 'skill.deprecate',
  active: 'skill.restore',
};

async function handleStatus(name: string, req: NextRequest, adminUser: AdminAuthContext['user']): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (typeof body !== 'object' || body === null) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { status, reason } = body as Record<string, unknown>;

  const statusResult = skillStatusSchema.safeParse(status);
  if (!statusResult.success) {
    return NextResponse.json(
      { error: 'Invalid status. Must be one of: active, deprecated, quarantined, removed' },
      { status: 400 },
    );
  }

  if (typeof reason !== 'string' || reason.trim().length === 0) {
    return NextResponse.json(
      { error: 'reason is required and must be a non-empty string' },
      { status: 400 },
    );
  }

  const [skill] = await db
    .select({ id: skills.id, name: skills.name, status: skills.status })
    .from(skills)
    .where(eq(skills.name, name))
    .limit(1);

  if (!skill) {
    return NextResponse.json({ error: 'Package not found' }, { status: 404 });
  }

  const previousStatus = skill.status;
  const newStatus = statusResult.data;

  await db.transaction(async (tx) => {
    await tx
      .update(skills)
      .set({
        status: newStatus,
        statusReason: reason.trim(),
        statusChangedBy: adminUser.id,
        statusChangedAt: new Date(),
      })
      .where(eq(skills.id, skill.id));

    await tx.insert(auditEvents).values({
      action: statusActionMap[newStatus] ?? `skill.status.${newStatus}`,
      actorId: adminUser.id,
      targetType: 'skill',
      targetId: skill.id,
      metadata: { reason: reason.trim(), previousStatus },
    });
  });

  return NextResponse.json({
    success: true,
    name: skill.name,
    previousStatus,
    status: newStatus,
  });
}

export const GET = withAdminAuth(async (req: NextRequest, _ctx: AdminAuthContext, routeCtx?: RouteParams): Promise<NextResponse> => {
  const segments = await getSegments(routeCtx);
  const { name, action } = parseSegments(segments);

  if (action) {
    return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
  }

  return handleGetDetail(name);
});

export const DELETE = withAdminAuth(async (req: NextRequest, { user: adminUser }: AdminAuthContext, routeCtx?: RouteParams): Promise<NextResponse> => {
  const segments = await getSegments(routeCtx);
  const { name, action } = parseSegments(segments);

  if (action) {
    return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
  }

  return handleDelete(name, adminUser);
});

export const POST = withAdminAuth(async (req: NextRequest, { user: adminUser }: AdminAuthContext, routeCtx?: RouteParams): Promise<NextResponse> => {
  const segments = await getSegments(routeCtx);
  const { name, action } = parseSegments(segments);

  if (action === 'feature') {
    return handleFeature(name, req, adminUser);
  }

  return NextResponse.json({ error: 'Not found' }, { status: 404 });
});

export const PATCH = withAdminAuth(async (req: NextRequest, { user: adminUser }: AdminAuthContext, routeCtx?: RouteParams): Promise<NextResponse> => {
  const segments = await getSegments(routeCtx);
  const { name, action } = parseSegments(segments);

  if (action === 'status') {
    return handleStatus(name, req, adminUser);
  }

  return NextResponse.json({ error: 'Not found' }, { status: 404 });
});
