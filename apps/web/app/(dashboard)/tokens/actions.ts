'use server';

import { headers } from 'next/headers';
import { auth } from '@/lib/auth';

export async function createToken(name: string) {
  const reqHeaders = await headers();
  const session = await auth.api.getSession({ headers: reqHeaders });

  if (!session) {
    throw new Error('Unauthorized');
  }

  const result = await auth.api.createApiKey({
    body: {
      name,
      userId: session.user.id,
      expiresIn: 90 * 24 * 60 * 60,
        rateLimitMax: 1000,
    },
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

  return result;
}
