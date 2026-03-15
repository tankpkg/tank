import { apiKey } from '@better-auth/api-key';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { genericOAuth, organization } from 'better-auth/plugins';

import { db } from './db';
import { checkEmailRateLimit, checkVerificationRateLimit } from './email/rate-limiter';
import { getFromAddress, getProvider, sendEmail } from './email/service';

const enabledProviders = new Set(
  (process.env.AUTH_PROVIDERS || 'github,credentials')
    .split(',')
    .map((provider) => provider.trim().toLowerCase())
    .filter(Boolean)
);

const githubEnabled =
  enabledProviders.has('github') && Boolean(process.env.GITHUB_CLIENT_ID) && Boolean(process.env.GITHUB_CLIENT_SECRET);

const oidcEnabled =
  enabledProviders.has('oidc') &&
  Boolean(process.env.OIDC_CLIENT_ID) &&
  Boolean(process.env.OIDC_CLIENT_SECRET) &&
  Boolean(
    process.env.OIDC_DISCOVERY_URL ||
      (process.env.OIDC_AUTHORIZATION_URL && process.env.OIDC_TOKEN_URL && process.env.OIDC_USER_INFO_URL)
  );

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
  baseURL: process.env.BETTER_AUTH_URL || process.env.APP_URL || 'http://localhost:3000',
  basePath: '/api/auth',
  secret: process.env.BETTER_AUTH_SECRET,
  emailAndPassword: {
    enabled: enabledProviders.has('credentials'),
    requireEmailVerification: enabledProviders.has('credentials')
  },
  emailVerification: {
    sendOnSignUp: enabledProviders.has('credentials'),
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      const rateLimit = await checkVerificationRateLimit(user.email);
      if (!rateLimit.allowed) {
        throw new Error(
          `Too many verification emails. Please wait ${Math.ceil(rateLimit.resetIn / 60000)} minutes before requesting another.`
        );
      }

      const appName = process.env.APP_NAME || 'Tank';
      const result = await sendEmail({
        from: getFromAddress(),
        to: user.email,
        subject: `Verify your ${appName} account`,
        html: `<p>Hello ${user.name || 'there'},</p><p>Please verify your email address by visiting <a href="${url}">${url}</a>.</p>`,
        text: `Hello ${user.name || 'there'},\n\nPlease verify your email address by visiting:\n${url}`
      });

      if (!result.success) {
        throw new Error(result.error || 'Failed to send verification email');
      }

      if (getProvider() === 'console') {
      }
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
    organization({
      allowUserToCreateOrganization: true,
      async sendInvitationEmail(data) {
        const rateLimit = await checkEmailRateLimit(data.email);
        if (!rateLimit.allowed) {
          throw new Error(`Too many emails sent. Please wait ${Math.ceil(rateLimit.resetIn / 60000)} minutes.`);
        }

        const appUrl = process.env.APP_URL || 'http://localhost:3000';
        const acceptUrl = `${appUrl}/orgs/accept-invitation?id=${data.id}`;
        const result = await sendEmail({
          from: getFromAddress(),
          to: data.email,
          subject: `You've been invited to join ${data.organization.name} on Tank`,
          html: `<p>${data.inviter.user.name || data.inviter.user.email} invited you to join ${data.organization.name}.</p><p><a href="${acceptUrl}">${acceptUrl}</a></p>`,
          text: `${data.inviter.user.name || data.inviter.user.email} invited you to join ${data.organization.name}.\n\n${acceptUrl}`
        });

        if (!result.success) {
          throw new Error(result.error || 'Failed to send invitation email');
        }
      }
    }),
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
  ]
});
