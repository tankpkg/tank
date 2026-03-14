import { createServerFn } from '@tanstack/react-start';
import { getRequestHeaders } from '@tanstack/react-start/server';

import { auth } from '~/lib/auth';
import { isAdmin as checkIsAdmin } from '~/lib/auth-helpers';

export const getSession = createServerFn({ method: 'GET' }).handler(async () => {
  const headers = getRequestHeaders();
  const session = await auth.api.getSession({ headers });
  return session;
});

export const getAdminSession = createServerFn({ method: 'GET' }).handler(async () => {
  const headers = getRequestHeaders();
  const session = await auth.api.getSession({ headers });
  if (!session) return null;
  const admin = await checkIsAdmin(session.user.id);
  if (!admin) return null;
  return session;
});

export const getAuthProviders = createServerFn({ method: 'GET' }).handler(async () => {
  const raw = process.env.AUTH_PROVIDERS || 'github,credentials';
  const providers = raw
    .split(',')
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean);
  const oidcProviderId = process.env.OIDC_PROVIDER_ID || 'enterprise-oidc';
  return { providers, oidcProviderId };
});
