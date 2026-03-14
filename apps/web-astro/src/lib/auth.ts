import { apiKey } from '@better-auth/api-key';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { genericOAuth, organization } from 'better-auth/plugins';

import { db } from './db';

const enabledProviders = new Set(
  (process.env.AUTH_PROVIDERS || 'github,credentials')
    .split(',')
    .map((provider) => provider.trim().toLowerCase())
    .filter(Boolean)
);

const githubEnabled =
  enabledProviders.has('github') && !!process.env.GITHUB_CLIENT_ID && !!process.env.GITHUB_CLIENT_SECRET;

const oidcEnabled =
  enabledProviders.has('oidc') &&
  !!process.env.OIDC_CLIENT_ID &&
  !!process.env.OIDC_CLIENT_SECRET &&
  (!!process.env.OIDC_DISCOVERY_URL ||
    (!!process.env.OIDC_AUTHORIZATION_URL && !!process.env.OIDC_TOKEN_URL && !!process.env.OIDC_USER_INFO_URL));

const oidcProviderId = process.env.OIDC_PROVIDER_ID || 'enterprise-oidc';

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: 'pg'
  }),

  // No NEXT_PUBLIC_ prefix — plain env vars
  baseURL: process.env.BETTER_AUTH_URL || process.env.APP_URL || 'http://localhost:4321',
  secret: process.env.BETTER_AUTH_SECRET,

  emailAndPassword: {
    enabled: enabledProviders.has('credentials'),
    requireEmailVerification: enabledProviders.has('credentials')
  },

  emailVerification: {
    sendOnSignUp: enabledProviders.has('credentials'),
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      // TODO: port email sending from existing auth.ts
      console.log(`Verification email for ${user.email}: ${url}`);
    }
  },

  socialProviders: githubEnabled
    ? {
        github: {
          clientId: getRequiredEnv('GITHUB_CLIENT_ID'),
          clientSecret: getRequiredEnv('GITHUB_CLIENT_SECRET')
        }
      }
    : {},

  plugins: [
    apiKey({ defaultPrefix: 'tank_' }),
    organization({ allowUserToCreateOrganization: true }),
    ...(oidcEnabled
      ? [
          genericOAuth({
            config: [
              {
                providerId: oidcProviderId,
                clientId: getRequiredEnv('OIDC_CLIENT_ID'),
                clientSecret: getRequiredEnv('OIDC_CLIENT_SECRET'),
                discoveryUrl: process.env.OIDC_DISCOVERY_URL,
                authorizationUrl: process.env.OIDC_AUTHORIZATION_URL,
                tokenUrl: process.env.OIDC_TOKEN_URL,
                userInfoUrl: process.env.OIDC_USER_INFO_URL,
                scopes: ['openid', 'profile', 'email']
              }
            ]
          })
        ]
      : [])
    // No nextCookies() — better-auth handles cookies natively on Hono
  ]
});
