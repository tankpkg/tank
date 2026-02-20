import { NextRequest, NextResponse } from 'next/server';
import { eq, desc, sql } from 'drizzle-orm';
import { withAdminAuth, type AdminAuthContext } from '@/lib/admin-middleware';
import { db } from '@/lib/db';
import { skills, skillVersions, skillDownloads, auditEvents } from '@/lib/db/schema';
import { user } from '@/lib/db/auth-schema';

function extractName(req: NextRequest): string {
  const segments = new URL(req.url).pathname.split('/');
  const packagesIdx = segments.indexOf('packages');
  return decodeURIComponent(segments[packagesIdx + 1]);
}

export const GET = withAdminAuth(async (req: NextRequest): Promise<NextResponse> => {
  const name = extractName(req);

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
    (e) => e.targetType === 'skill',
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
});

export const DELETE = withAdminAuth(async (req: NextRequest, { user: adminUser }: AdminAuthContext): Promise<NextResponse> => {
  const name = extractName(req);

  const [skill] = await db
    .select({ id: skills.id, name: skills.name, status: skills.status })
    .from(skills)
    .where(eq(skills.name, name))
    .limit(1);

  if (!skill) {
    return NextResponse.json({ error: 'Package not found' }, { status: 404 });
  }

  const previousStatus = skill.status;

  await db
    .update(skills)
    .set({
      status: 'removed',
      statusReason: 'Removed by admin',
      statusChangedBy: adminUser.id,
      statusChangedAt: new Date(),
    })
    .where(eq(skills.id, skill.id));

  await db.insert(auditEvents).values({
    action: 'skill.remove',
    actorId: adminUser.id,
    targetType: 'skill',
    targetId: skill.id,
    metadata: { reason: 'Removed by admin', previousStatus },
  });

  return NextResponse.json({ success: true, name: skill.name, status: 'removed' });
});
