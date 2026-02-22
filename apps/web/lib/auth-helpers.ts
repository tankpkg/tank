import { auth } from './auth';
import { db } from './db';
import { userStatus, member } from './db/schema';
import { and, desc, eq } from 'drizzle-orm';

export interface VerifiedApiKey {
  userId: string;
  keyId: string;
}

export type ModerationStatus = 'active' | 'suspended' | 'banned';

export async function getUserModerationStatus(userId: string): Promise<ModerationStatus> {
  const latest = await db
    .select({ status: userStatus.status })
    .from(userStatus)
    .where(eq(userStatus.userId, userId))
    .orderBy(desc(userStatus.createdAt))
    .limit(1);

  return (latest[0]?.status as ModerationStatus | undefined) ?? 'active';
}

export async function isUserBlocked(userId: string): Promise<boolean> {
  const status = await getUserModerationStatus(userId);
  return status === 'banned' || status === 'suspended';
}

/**
 * Verify a CLI request's API key from the Authorization header.
 * Expects: `Authorization: Bearer tank_...`
 * Returns verified key info or null if invalid/missing.
 */
export async function verifyCliAuth(request: Request): Promise<VerifiedApiKey | null> {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.slice(7);
  if (!token) {
    return null;
  }

  try {
    const result = await auth.api.verifyApiKey({ body: { key: token } });

    if (!result.valid || !result.key) {
      return null;
    }

    if (await isUserBlocked(result.key.userId)) {
      return null;
    }

    return {
      userId: result.key.userId,
      keyId: result.key.id,
    };
  } catch {
    return null;
  }
}

export interface SkillAccessSubject {
  visibility: 'public' | 'private';
  publisherId: string;
  orgId: string | null;
}

export async function resolveRequestUserId(request: Request): Promise<string | null> {
  const cliVerified = await verifyCliAuth(request);
  if (cliVerified) {
    return cliVerified.userId;
  }

  try {
    const session = await auth.api.getSession({ headers: request.headers });
    return session?.user.id ?? null;
  } catch {
    return null;
  }
}

export async function canReadSkill(
  skill: SkillAccessSubject,
  userId: string | null,
): Promise<boolean> {
  if (skill.visibility === 'public') {
    return true;
  }

  if (!userId) {
    return false;
  }

  if (skill.publisherId === userId) {
    return true;
  }

  if (!skill.orgId) {
    return false;
  }

  const membership = await db
    .select({ id: member.id })
    .from(member)
    .where(and(eq(member.organizationId, skill.orgId), eq(member.userId, userId)))
    .limit(1);

  return membership.length > 0;
}
