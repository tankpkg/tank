import { createServerFn } from '@tanstack/react-start';
import { getRequestHeaders } from '@tanstack/react-start/server';

import { isAdmin as checkIsAdmin } from '~/lib/auth/authz';
import { auth } from '~/lib/auth/core';
import { enabledProviders, env } from '~/lib/env';

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
  return { providers: [...enabledProviders], oidcProviderId: env.OIDC_PROVIDER_ID };
});
