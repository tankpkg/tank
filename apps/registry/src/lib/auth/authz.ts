import { defaultKeyHasher } from '@better-auth/api-key';
import { and, desc, eq, sql } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import {
  type ApiKeyTransaction,
  apiKeyOwner,
  deferApiKeyVerification,
  finishApiKeyVerification,
  withApiKeyReadTimeout,
  withFreshApiKeyRequest
} from '~/lib/auth/api-key-safety';
import { auth } from '~/lib/auth/core';
import { db } from '~/lib/db';
import { apikey, member, user } from '~/lib/db/auth-schema';
import { skillAccess, userStatus } from '~/lib/db/schema';

export interface VerifiedApiKey {
  userId: string;
  keyId: string;
  scopes: string[];
  owner: { id: string; name: string; email: string };
}

export type SessionData = NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>;

const ADMIN_SCOPE = 'skills:admin';

function authenticationUnavailable(): HTTPException {
  return new HTTPException(503, {
    res: Response.json(
      { error: 'API-key verification temporarily unavailable. Please retry or contact an administrator.' },
      { status: 503 }
    )
  });
}

export async function readAuthenticationData<T>(read: () => PromiseLike<T>): Promise<T> {
  try {
    return await withApiKeyReadTimeout(read);
  } catch {
    throw authenticationUnavailable();
  }
}

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

      const prefix = `${resource}:`;
      return permissions
        .filter((permission): permission is string => typeof permission === 'string' && permission.trim().length > 0)
        .map((permission) => (permission.startsWith(prefix) ? permission : `${prefix}${permission}`));
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

async function hasConflictingApiKey(keyHash: string): Promise<boolean> {
  // Better Auth can select any row when duplicate hashes exist.
  const rows = await withApiKeyReadTimeout(() =>
    db
      .select({ id: apikey.id })
      .from(apikey)
      .where(
        and(
          eq(apikey.key, keyHash),
          sql`${apikey.key} COLLATE "C" = ${keyHash} COLLATE "C"`,
          sql`${apikey.userId} IS NOT NULL AND octet_length(${apikey.userId}) > 0
          AND ${apikey.referenceId} IS NOT NULL AND octet_length(${apikey.referenceId}) > 0
          AND ${apikey.userId} COLLATE "C" <> ${apikey.referenceId} COLLATE "C"`
        )
      )
      .limit(1)
  );
  return rows.length > 0;
}

export function hasRequiredScopes(grantedScopes: string[], requiredScopes: string[]): boolean {
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

async function readOwnerInTransaction(tx: ApiKeyTransaction, ownerId: string): Promise<VerifiedApiKey['owner'] | null> {
  const [owner] = await tx
    .select({ id: user.id, name: user.name, email: user.email })
    .from(user)
    .where(and(eq(user.id, ownerId), sql`${user.id} COLLATE "C" = ${ownerId} COLLATE "C"`))
    .limit(1);
  return owner ?? null;
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

/**
 * Authenticates a CLI/API request via Bearer token. Returns the verified key
 * (with parsed scopes) on success, or null if the token is missing/invalid/
 * disabled/blocked. Callers that need to enforce scopes MUST do so explicitly
 * via `hasRequiredScopes(verified.scopes, [...])` and return 403 (NOT 401) on
 * scope failure — those are different concerns and the CLI surfaces them as
 * different user errors ("log in again" vs "your token can't do that").
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

  return withFreshApiKeyRequest(async () => {
    try {
      // Better Auth updates usage fields during verification. Reject conflicts first
      // so an unauthorized request cannot mutate the conflicting key row.
      const keyHash = await defaultKeyHasher(token);
      if (await hasConflictingApiKey(keyHash)) return null;
      if (request.signal.aborted) return null;

      deferApiKeyVerification();
      const result = await auth.api.verifyApiKey({ body: { key: token } });

      if (result.error?.code === 'API_KEY_LOCK_TIMEOUT' || result.error?.code === 'API_KEY_VERIFICATION_UNAVAILABLE') {
        throw authenticationUnavailable();
      }
      if (!result.valid || !result.key) {
        return null;
      }

      const verifiedKey = result.key;
      const rows = await withApiKeyReadTimeout(() =>
        db
          .select({ key: apikey.key, userId: apikey.userId, referenceId: apikey.referenceId })
          .from(apikey)
          .where(eq(apikey.id, verifiedKey.id))
          .limit(1)
      );
      const storedKey = rows[0];
      if (!storedKey || storedKey.key !== keyHash) return null;
      const ownerId = apiKeyOwner(storedKey);
      if (!ownerId || ownerId !== verifiedKey.referenceId) return null;

      if (request.signal.aborted) return null;
      const validated: { owner: VerifiedApiKey['owner'] | null } = { owner: null };
      const finalized = await finishApiKeyVerification(async (tx, owner) => {
        validated.owner = await readOwnerInTransaction(tx, owner);
        return !!validated.owner;
      });
      if (!finalized || finalized.id !== verifiedKey.id || finalized.referenceId !== ownerId || !validated.owner) {
        return null;
      }
      return {
        userId: ownerId,
        keyId: verifiedKey.id,
        scopes: parseScopes(verifiedKey.permissions),
        owner: validated.owner
      };
    } catch (error) {
      if (error instanceof HTTPException) throw error;
      throw authenticationUnavailable();
    }
  }, request.signal);
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
  if (request.signal.aborted) return null;

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
