import { and, desc, eq, sql } from 'drizzle-orm';

import { auth } from './auth';
import { db } from './db';
import { apikey, member, user } from './db/auth-schema';
import { serviceAccounts, skillAccess, userStatus } from './db/schema';

export interface VerifiedApiKey {
  userId: string;
  keyId: string;
  scopes: string[];
}

export type SessionData = NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>;

const ADMIN_SCOPE = 'skills:admin';

function parseScopes(rawPermissions: unknown): string[] {
  if (!rawPermissions) {
    return [];
  }

  if (Array.isArray(rawPermissions)) {
    return rawPermissions.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
  }

  if (typeof rawPermissions === 'object') {
    return Object.entries(rawPermissions as Record<string, unknown>).flatMap(([resource, permissions]) => {
      if (!Array.isArray(permissions)) {
        return [];
      }

      return permissions
        .filter((permission): permission is string => typeof permission === 'string' && permission.trim().length > 0)
        .map((permission) => `${resource}:${permission}`);
    });
  }

  if (typeof rawPermissions !== 'string' || rawPermissions.trim().length === 0) {
    return [];
  }

  try {
    return parseScopes(JSON.parse(rawPermissions));
  } catch {
    return [];
  }
}

async function resolveApiKeyOwnerId(key: {
  id?: unknown;
  referenceId?: unknown;
  userId?: unknown;
}): Promise<string | null> {
  if (typeof key.referenceId === 'string' && key.referenceId.length > 0) {
    return key.referenceId;
  }

  if (typeof key.userId === 'string' && key.userId.length > 0) {
    return key.userId;
  }

  if (typeof key.id !== 'string' || key.id.length === 0) {
    return null;
  }

  const rows = await db.select({ userId: apikey.userId }).from(apikey).where(eq(apikey.id, key.id)).limit(1);

  return rows[0]?.userId ?? null;
}

function hasRequiredScopes(grantedScopes: string[], requiredScopes: string[]): boolean {
  if (requiredScopes.length === 0) {
    return true;
  }

  // Legacy backward-compat: keys created before scope enforcement have empty scopes.
  // Treat as unrestricted. To tighten: migrate existing keys to explicit scopes first.
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

export async function getSessionFromRequest(request: Request): Promise<SessionData | null> {
  try {
    return await auth.api.getSession({ headers: request.headers });
  } catch {
    return null;
  }
}

export async function isAdmin(userId: string): Promise<boolean> {
  const dbUser = await db.select({ role: user.role }).from(user).where(eq(user.id, userId)).limit(1);
  return dbUser[0]?.role === 'admin';
}

export async function verifyCliAuth(request: Request, requiredScopes: string[] = []): Promise<VerifiedApiKey | null> {
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

    const ownerId = await resolveApiKeyOwnerId(result.key);
    if (!ownerId) {
      return null;
    }

    if (await isUserBlocked(ownerId)) {
      return null;
    }

    try {
      const serviceAccount = await db
        .select({ disabled: serviceAccounts.disabled })
        .from(serviceAccounts)
        .where(eq(serviceAccounts.userId, ownerId))
        .limit(1);

      if (serviceAccount[0]?.disabled) {
        return null;
      }
    } catch {
      // DB error checking service account status — don't block auth for regular users.
    }

    const scopes = parseScopes(result.key.permissions);
    if (!hasRequiredScopes(scopes, requiredScopes)) {
      return null;
    }

    return {
      userId: ownerId,
      keyId: result.key.id,
      scopes
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

async function checkAccessGrants(skillId: string, userId: string): Promise<boolean> {
  const directGrant = await db
    .select({ id: skillAccess.id })
    .from(skillAccess)
    .where(and(eq(skillAccess.skillId, skillId), eq(skillAccess.grantedUserId, userId)))
    .limit(1);

  if (directGrant.length > 0) {
    return true;
  }

  const orgGrant = await db.execute(sql`
    SELECT sa.id
    FROM skill_access sa
    INNER JOIN "member" m ON m.organization_id = sa.granted_org_id
    WHERE sa.skill_id = ${skillId}
      AND m.user_id = ${userId}
    LIMIT 1
  `);

  return orgGrant.length > 0;
}

export async function canReadSkill(skill: SkillAccessSubject, userId: string | null): Promise<boolean> {
  if (skill.visibility === 'public') return true;
  if (!userId) return false;
  if (skill.publisherId === userId) return true;

  if (!skill.orgId) {
    return checkAccessGrants(skill.skillId, userId);
  }

  const membership = await db
    .select({ id: member.id })
    .from(member)
    .where(and(eq(member.organizationId, skill.orgId), eq(member.userId, userId)))
    .limit(1);

  if (membership.length > 0) return true;

  return checkAccessGrants(skill.skillId, userId);
}
