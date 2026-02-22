import { NextRequest, NextResponse } from 'next/server';
import { eq, desc, count } from 'drizzle-orm';
import { userRoleSchema } from '@tank/shared';
import { withAdminAuth, type AdminAuthContext } from '@/lib/admin-middleware';
import { db } from '@/lib/db';
import { user, userStatus, auditEvents, skills, member } from '@/lib/db/schema';

function extractUserId(req: NextRequest): string {
  const segments = new URL(req.url).pathname.split('/');
  const usersIdx = segments.indexOf('users');
  return segments[usersIdx + 1];
}

export const GET = withAdminAuth(async (req: NextRequest): Promise<NextResponse> => {
  const userId = extractUserId(req);

  const [targetUser] = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      githubUsername: user.githubUsername,
      image: user.image,
      role: user.role,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);

  if (!targetUser) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const statusHistory = await db
    .select({
      id: userStatus.id,
      status: userStatus.status,
      reason: userStatus.reason,
      bannedBy: userStatus.bannedBy,
      expiresAt: userStatus.expiresAt,
      createdAt: userStatus.createdAt,
    })
    .from(userStatus)
    .where(eq(userStatus.userId, userId))
    .orderBy(desc(userStatus.createdAt))
    .limit(50);

  const [packagesResult] = await db
    .select({ count: count() })
    .from(skills)
    .where(eq(skills.publisherId, userId));

  const [orgsResult] = await db
    .select({ count: count() })
    .from(member)
    .where(eq(member.userId, userId));

  return NextResponse.json({
    user: targetUser,
    statusHistory,
    counts: {
      packages: packagesResult?.count ?? 0,
      organizations: orgsResult?.count ?? 0,
    },
  });
});

export const PATCH = withAdminAuth(async (req: NextRequest, { user: adminUser }: AdminAuthContext): Promise<NextResponse> => {
  const userId = extractUserId(req);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = userRoleSchema.safeParse(
    typeof body === 'object' && body !== null && 'role' in body
      ? (body as Record<string, unknown>).role
      : undefined,
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request body. Expected { role: "user" | "admin" }' },
      { status: 400 },
    );
  }

  const newRole = parsed.data;

  if (adminUser.id === userId) {
    return NextResponse.json(
      { error: 'Cannot change your own role' },
      { status: 400 },
    );
  }

  const [targetUser] = await db
    .select({ id: user.id, role: user.role })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);

  if (!targetUser) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const oldRole = targetUser.role;

  if (oldRole === newRole) {
    return NextResponse.json(
      { error: `User already has role '${newRole}'` },
      { status: 400 },
    );
  }

  await db.transaction(async (tx) => {
    await tx
      .update(user)
      .set({ role: newRole })
      .where(eq(user.id, userId));

    await tx.insert(auditEvents).values({
      action: newRole === 'admin' ? 'user.promote' : 'user.demote',
      actorId: adminUser.id,
      targetType: 'user',
      targetId: userId,
      metadata: { oldRole, newRole },
    });
  });

  return NextResponse.json({
    success: true,
    userId,
    oldRole,
    newRole,
  });
});
