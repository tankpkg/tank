import { NextRequest, NextResponse } from 'next/server';
import { eq, and, inArray } from 'drizzle-orm';
import { withAdminAuth, type AdminAuthContext } from '@/lib/admin-middleware';
import { db } from '@/lib/db';
import { member } from '@/lib/db/auth-schema';
import { auditEvents } from '@/lib/db/schema';

function extractIds(req: NextRequest): { orgId: string; memberId: string } {
  const segments = req.nextUrl.pathname.split('/');
  return {
    orgId: segments[segments.indexOf('orgs') + 1],
    memberId: segments[segments.indexOf('members') + 1],
  };
}

export const DELETE = withAdminAuth(async (req: NextRequest, ctx: AdminAuthContext): Promise<NextResponse> => {
  const { orgId, memberId } = extractIds(req);

  const [targetMember] = await db
    .select()
    .from(member)
    .where(and(eq(member.id, memberId), eq(member.organizationId, orgId)))
    .limit(1);

  if (!targetMember) {
    return NextResponse.json({ error: 'Member not found' }, { status: 404 });
  }

  if (targetMember.role === 'owner' || targetMember.role === 'admin') {
    const ownerAdmins = await db
      .select({ id: member.id })
      .from(member)
      .where(
        and(
          eq(member.organizationId, orgId),
          inArray(member.role, ['owner', 'admin']),
        ),
      );

    if (ownerAdmins.length <= 1) {
      return NextResponse.json(
        { error: 'Cannot remove the last owner/admin of an organization' },
        { status: 400 },
      );
    }
  }

  await db.transaction(async (tx) => {
    await tx
      .delete(member)
      .where(eq(member.id, memberId));

    await tx.insert(auditEvents).values({
      action: 'org.member.remove',
      actorId: ctx.user.id,
      targetType: 'member',
      targetId: memberId,
      metadata: {
        orgId,
        userId: targetMember.userId,
      },
    });
  });

  return NextResponse.json({ success: true });
});
