import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { userStatusSchema } from '@tank/shared';
import { withAdminAuth, type AdminAuthContext } from '@/lib/admin-middleware';
import { db } from '@/lib/db';
import { user, userStatus, auditEvents } from '@/lib/db/schema';

function extractUserId(req: NextRequest): string {
  const segments = new URL(req.url).pathname.split('/');
  const usersIdx = segments.indexOf('users');
  return segments[usersIdx + 1];
}

const actionMap: Record<string, string> = {
  banned: 'user.ban',
  suspended: 'user.suspend',
  active: 'user.unban',
};

export const POST = withAdminAuth(async (req: NextRequest, { user: adminUser }: AdminAuthContext): Promise<NextResponse> => {
  const userId = extractUserId(req);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (typeof body !== 'object' || body === null) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { status, reason, expiresAt } = body as Record<string, unknown>;

  // Validate status
  const statusParsed = userStatusSchema.safeParse(status);
  if (!statusParsed.success) {
    return NextResponse.json(
      { error: 'Invalid status. Expected "active", "suspended", or "banned"' },
      { status: 400 },
    );
  }

  const validStatus = statusParsed.data;

  // Validate reason
  if (reason !== undefined && reason !== null && typeof reason !== 'string') {
    return NextResponse.json({ error: 'Reason must be a string' }, { status: 400 });
  }

  // Reason required when banning
  if (validStatus === 'banned' && (!reason || (typeof reason === 'string' && reason.trim() === ''))) {
    return NextResponse.json(
      { error: 'Reason is required when banning a user' },
      { status: 400 },
    );
  }

  // Validate expiresAt if provided
  if (expiresAt !== undefined && expiresAt !== null) {
    if (typeof expiresAt !== 'string' || isNaN(Date.parse(expiresAt))) {
      return NextResponse.json(
        { error: 'expiresAt must be a valid ISO datetime string' },
        { status: 400 },
      );
    }
  }

  if (adminUser.id === userId) {
    return NextResponse.json(
      { error: 'Cannot change your own status' },
      { status: 400 },
    );
  }

  const [targetUser] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);

  if (!targetUser) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  await db.insert(userStatus).values({
    userId,
    status: validStatus,
    reason: (typeof reason === 'string' ? reason : null),
    bannedBy: adminUser.id,
    expiresAt: typeof expiresAt === 'string' ? new Date(expiresAt) : null,
  });

  await db.insert(auditEvents).values({
    action: actionMap[validStatus] ?? `user.status.${validStatus}`,
    actorId: adminUser.id,
    targetType: 'user',
    targetId: userId,
    metadata: {
      status: validStatus,
      reason: typeof reason === 'string' ? reason : null,
      expiresAt: typeof expiresAt === 'string' ? expiresAt : null,
    },
  });

  return NextResponse.json({
    success: true,
    userId,
    status: validStatus,
  });
});
