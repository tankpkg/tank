import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { skillStatusSchema } from '@tank/shared';
import { withAdminAuth, type AdminAuthContext } from '@/lib/admin-middleware';
import { db } from '@/lib/db';
import { skills, auditEvents } from '@/lib/db/schema';

function extractName(req: NextRequest): string {
  const segments = new URL(req.url).pathname.split('/');
  const packagesIdx = segments.indexOf('packages');
  return decodeURIComponent(segments[packagesIdx + 1]);
}

const actionMap: Record<string, string> = {
  quarantined: 'skill.quarantine',
  removed: 'skill.remove',
  deprecated: 'skill.deprecate',
  active: 'skill.restore',
};

export const PATCH = withAdminAuth(async (req: NextRequest, { user: adminUser }: AdminAuthContext): Promise<NextResponse> => {
  const name = extractName(req);

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

  await db
    .update(skills)
    .set({
      status: newStatus,
      statusReason: reason.trim(),
      statusChangedBy: adminUser.id,
      statusChangedAt: new Date(),
    })
    .where(eq(skills.id, skill.id));

  await db.insert(auditEvents).values({
    action: actionMap[newStatus] ?? `skill.status.${newStatus}`,
    actorId: adminUser.id,
    targetType: 'skill',
    targetId: skill.id,
    metadata: { reason: reason.trim(), previousStatus },
  });

  return NextResponse.json({
    success: true,
    name: skill.name,
    previousStatus,
    status: newStatus,
  });
});
