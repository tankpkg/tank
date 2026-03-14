import { createServerFn } from '@tanstack/react-start';
import { getRequestHeaders } from '@tanstack/react-start/server';

import { auth } from '~/lib/auth';
import { db } from '~/lib/db';
import { auditEvents } from '~/lib/db/schema';

const allowedScopes = new Set(['skills:read', 'skills:publish', 'skills:admin']);

function normalizeScopes(scopes: string[] | undefined): string[] {
  if (!scopes || scopes.length === 0) return ['skills:read'];

  const normalized = Array.from(
    new Set(scopes.map((s) => s.trim()).filter((s) => s.length > 0 && allowedScopes.has(s)))
  );

  if (normalized.length === 0) normalized.push('skills:read');
  if (normalized.includes('skills:admin') && !normalized.includes('skills:read')) {
    normalized.push('skills:read');
  }

  return normalized;
}

async function requireSession() {
  const headers = getRequestHeaders();
  const session = await auth.api.getSession({ headers });
  if (!session) throw new Error('Unauthorized');
  return { session, headers };
}

export const listTokensFn = createServerFn({ method: 'GET' }).handler(async () => {
  const { headers } = await requireSession();
  return auth.api.listApiKeys({ headers });
});

export const createTokenFn = createServerFn({ method: 'POST' })
  .inputValidator((input: { name: string; expiresInDays?: number; scopes?: string[] }) => input)
  .handler(async ({ data }) => {
    const { session } = await requireSession();
    const { name, expiresInDays, scopes } = data;

    const normalizedScopes = normalizeScopes(scopes);
    const normalizedExpiry =
      typeof expiresInDays === 'number' && Number.isFinite(expiresInDays)
        ? Math.max(1, Math.min(365, Math.floor(expiresInDays)))
        : 90;

    const result = await auth.api.createApiKey({
      body: {
        name,
        userId: session.user.id,
        expiresIn: normalizedExpiry * 24 * 60 * 60,
        rateLimitMax: 1000,
        permissions: { skills: normalizedScopes }
      }
    });

    await db.insert(auditEvents).values({
      action: 'api_key.create',
      actorId: session.user.id,
      targetType: 'api_key',
      targetId: result.id,
      metadata: { name, scopes: normalizedScopes, expiresInDays: normalizedExpiry }
    });

    return result;
  });

export const revokeTokenFn = createServerFn({ method: 'POST' })
  .inputValidator((input: { keyId: string }) => input)
  .handler(async ({ data }) => {
    const { session, headers } = await requireSession();

    const result = await auth.api.deleteApiKey({
      body: { keyId: data.keyId },
      headers
    });

    await db.insert(auditEvents).values({
      action: 'api_key.revoke',
      actorId: session.user.id,
      targetType: 'api_key',
      targetId: data.keyId,
      metadata: {}
    });

    return result;
  });
