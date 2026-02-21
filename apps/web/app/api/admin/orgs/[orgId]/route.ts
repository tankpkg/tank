import { NextRequest, NextResponse } from 'next/server';
import { eq, count } from 'drizzle-orm';
import { withAdminAuth, type AdminAuthContext } from '@/lib/admin-middleware';
import { db } from '@/lib/db';
import { organization, member, user } from '@/lib/db/auth-schema';
import { skills, auditEvents } from '@/lib/db/schema';

function extractOrgId(req: NextRequest): string {
  const segments = req.nextUrl.pathname.split('/');
  return segments[segments.indexOf('orgs') + 1];
}

export const GET = withAdminAuth(async (req: NextRequest, _ctx: AdminAuthContext): Promise<NextResponse> => {
  const orgId = extractOrgId(req);

  const [org] = await db
    .select()
    .from(organization)
    .where(eq(organization.id, orgId))
    .limit(1);

  if (!org) {
    return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
  }

  const members = await db
    .select({
      id: member.id,
      role: member.role,
      createdAt: member.createdAt,
      userId: user.id,
      userName: user.name,
      userEmail: user.email,
    })
    .from(member)
    .innerJoin(user, eq(member.userId, user.id))
    .where(eq(member.organizationId, orgId));

  const packages = await db
    .select({
      id: skills.id,
      name: skills.name,
      status: skills.status,
    })
    .from(skills)
    .where(eq(skills.orgId, orgId));

  return NextResponse.json({
    ...org,
    memberCount: members.length,
    packageCount: packages.length,
    members: members.map((m) => ({
      id: m.id,
      userId: m.userId,
      name: m.userName,
      email: m.userEmail,
      role: m.role,
      createdAt: m.createdAt,
    })),
    packages,
  });
});

export const DELETE = withAdminAuth(async (req: NextRequest, ctx: AdminAuthContext): Promise<NextResponse> => {
  const orgId = extractOrgId(req);

  const [org] = await db
    .select()
    .from(organization)
    .where(eq(organization.id, orgId))
    .limit(1);

  if (!org) {
    return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
  }

  const [memberCountResult] = await db
    .select({ count: count() })
    .from(member)
    .where(eq(member.organizationId, orgId));

  await db
    .update(skills)
    .set({ orgId: null })
    .where(eq(skills.orgId, orgId));

  await db
    .delete(organization)
    .where(eq(organization.id, orgId));

  await db.insert(auditEvents).values({
    action: 'org.delete',
    actorId: ctx.user.id,
    targetType: 'organization',
    targetId: orgId,
    metadata: {
      name: org.name,
      slug: org.slug,
      memberCount: memberCountResult.count,
    },
  });

  return NextResponse.json({ success: true });
});
