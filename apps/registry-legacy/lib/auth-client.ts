import { apiKeyClient } from '@better-auth/api-key/client';
import { genericOAuthClient, organizationClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';

// Build: 2026-02-17-v2
export const authClient = createAuthClient({
  baseURL: '',
  plugins: [apiKeyClient(), organizationClient(), genericOAuthClient()]
});

export const { signIn, signOut, useSession } = authClient;
