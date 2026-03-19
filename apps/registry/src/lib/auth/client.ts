import { apiKeyClient } from '@better-auth/api-key/client';
import { genericOAuthClient, organizationClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';

export const authClient = createAuthClient({
  baseURL: '',
  basePath: '/api/auth',
  plugins: [apiKeyClient(), organizationClient(), genericOAuthClient()]
});

export const { signIn, signOut, useSession } = authClient;
