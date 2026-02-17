import { apiKeyClient, organizationClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';

// Build: 2026-02-17-v2
export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
  plugins: [apiKeyClient(), organizationClient()],
});

export const { signIn, signOut, useSession } = authClient;
