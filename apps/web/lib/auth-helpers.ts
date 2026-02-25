import { auth } from './auth';
import { db } from './db';
import { userStatus, member, skillAccess, serviceAccounts } from './db/schema';
import { and, desc, eq, sql } from 'drizzle-orm';

export interface VerifiedApiKey {
  userId: string;
  keyId: string;
  scopes: string[];
}

const ADMIN_SCOPE = 'skills:admin';

function parseScopes(rawPermissions: unknown): string[] {
  if (typeof rawPermissions !== 'string' || rawPermissions.trim().length === 0) {
    return [];
  }

  try {
    const parsed = JSON.parse(rawPermissions);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
  } catch {
    return [];
  }
}

function hasRequiredScopes(grantedScopes: string[], requiredScopes: string[]): boolean {
  if (requiredScopes.length === 0) {
    return true;
  }

  if (grantedScopes.length === 0) {
    return true;
  }

  const scopeSet = new Set(grantedScopes);
  if (scopeSet.has(ADMIN_SCOPE)) {
    return true;
  }

  return requiredScopes.every((scope) => scopeSet.has(scope));
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
export async function verifyCliAuth(
  request: Request,
  requiredScopes: string[] = [],
): Promise<VerifiedApiKey | null> {
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

    try {
      const serviceAccount = await db
        .select({ disabled: serviceAccounts.disabled })
        .from(serviceAccounts)
        .where(eq(serviceAccounts.userId, result.key.userId))
        .limit(1);

      if (serviceAccount[0]?.disabled) {
        return null;
      }
    } catch {
      // DB error checking service account status — don't block auth for regular users.
      // Only service accounts have rows in this table; most users have none.
    }

    const scopes = parseScopes(result.key.permissions);
    if (!hasRequiredScopes(scopes, requiredScopes)) {
      return null;
    }

    return {
      userId: result.key.userId,
      keyId: result.key.id,
      scopes,
    };
  } catch {
    return null;
  }
}

export interface SkillAccessSubject {
  skillId: string;
  visibility: 'public' | 'private';
  publisherId: string;
  orgId: string | null;
}

export async function resolveRequestUserId(request: Request): Promise<string | null> {
  // Identity resolution: accept ANY valid API key (no scope requirement).
  // Scope checks belong on specific write operations, not on user identification.
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
    const directGrant = await db
      .select({ id: skillAccess.id })
      .from(skillAccess)
      .where(and(eq(skillAccess.skillId, skill.skillId), eq(skillAccess.grantedUserId, userId)))
      .limit(1);

    if (directGrant.length > 0) {
      return true;
    }

    const orgGrant = await db.execute(sql`
      SELECT sa.id
      FROM skill_access sa
      INNER JOIN "member" m ON m.organization_id = sa.granted_org_id
      WHERE sa.skill_id = ${skill.skillId}
        AND m.user_id = ${userId}
      LIMIT 1
    `);

    return orgGrant.length > 0;
  }

  const membership = await db
    .select({ id: member.id })
    .from(member)
    .where(and(eq(member.organizationId, skill.orgId), eq(member.userId, userId)))
    .limit(1);

  if (membership.length > 0) {
    return true;
  }

  const directGrant = await db
    .select({ id: skillAccess.id })
    .from(skillAccess)
    .where(and(eq(skillAccess.skillId, skill.skillId), eq(skillAccess.grantedUserId, userId)))
    .limit(1);

  if (directGrant.length > 0) {
    return true;
  }

  const orgGrant = await db.execute(sql`
    SELECT sa.id
    FROM skill_access sa
    INNER JOIN "member" m ON m.organization_id = sa.granted_org_id
    WHERE sa.skill_id = ${skill.skillId}
      AND m.user_id = ${userId}
    LIMIT 1
  `);

  return orgGrant.length > 0;
}
