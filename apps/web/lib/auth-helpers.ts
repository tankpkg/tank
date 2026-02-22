import { auth } from './auth';
import { db } from './db';
import { userStatus } from './db/schema';
import { desc, eq } from 'drizzle-orm';

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
