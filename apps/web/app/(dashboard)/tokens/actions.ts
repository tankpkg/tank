'use server';

import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { auditEvents } from '@/lib/db/schema';

const allowedScopes = new Set(['skills:read', 'skills:publish', 'skills:admin']);

function normalizeScopes(scopes: string[] | undefined): string[] {
  if (!scopes || scopes.length === 0) {
    return ['skills:read'];
  }

  const normalized = Array.from(new Set(scopes
    .map((scope) => scope.trim())
    .filter((scope) => scope.length > 0 && allowedScopes.has(scope))));

  if (normalized.length === 0) {
    normalized.push('skills:read');
  }

  if (normalized.includes('skills:admin') && !normalized.includes('skills:read')) {
    normalized.push('skills:read');
  }

  return normalized;
}

export async function createToken(input: {
  name: string;
  expiresInDays?: number;
  scopes?: string[];
}) {
  const { name, expiresInDays, scopes } = input;
  const reqHeaders = await headers();
  const session = await auth.api.getSession({ headers: reqHeaders });

  if (!session) {
    throw new Error('Unauthorized');
  }

  const normalizedScopes = normalizeScopes(scopes);
  const normalizedExpiresInDays = typeof expiresInDays === 'number' && Number.isFinite(expiresInDays)
    ? Math.max(1, Math.min(365, Math.floor(expiresInDays)))
    : 90;

  const result = await auth.api.createApiKey({
    body: {
      name,
      userId: session.user.id,
      expiresIn: normalizedExpiresInDays * 24 * 60 * 60,
      rateLimitMax: 1000,
      permissions: {
        skills: normalizedScopes,
      },
    },
  });

  await db.insert(auditEvents).values({
    action: 'api_key.create',
    actorId: session.user.id,
    targetType: 'api_key',
    targetId: result.id,
    metadata: { name, scopes: normalizedScopes, expiresInDays: normalizedExpiresInDays },
  });

  return result;
}

export async function listTokens() {
  const reqHeaders = await headers();
  const session = await auth.api.getSession({ headers: reqHeaders });

  if (!session) {
    throw new Error('Unauthorized');
  }

  const keys = await auth.api.listApiKeys({
    headers: reqHeaders,
  });

  return keys;
}

export async function revokeToken(keyId: string) {
  const reqHeaders = await headers();
  const session = await auth.api.getSession({ headers: reqHeaders });

  if (!session) {
    throw new Error('Unauthorized');
  }

  const result = await auth.api.deleteApiKey({
    body: { keyId },
    headers: reqHeaders,
  });

  await db.insert(auditEvents).values({
    action: 'api_key.revoke',
    actorId: session.user.id,
    targetType: 'api_key',
    targetId: keyId,
    metadata: {},
  });

  return result;
}
