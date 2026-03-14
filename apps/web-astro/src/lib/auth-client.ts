import { genericOAuthClient, organizationClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';

export const authClient = createAuthClient({
  baseURL: import.meta.env.PUBLIC_APP_URL || 'http://localhost:4321',
  plugins: [organizationClient(), genericOAuthClient()]
});

export const { signIn, signOut, useSession } = authClient;
