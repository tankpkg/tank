import { apiKey } from '@better-auth/api-key';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { genericOAuth, organization } from 'better-auth/plugins';

import { enabledProviders, env, githubEnabled, oidcEnabled } from '~/consts/env';
import { db } from '~/lib/db';
import { checkEmailRateLimit, checkVerificationRateLimit } from '~/services/email/rate-limiter';
import { getFromAddress, getProvider, sendEmail } from '~/services/email/service';

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: 'pg'
  }),
  baseURL: env.BETTER_AUTH_URL || env.APP_URL,
  basePath: '/api/auth',
  secret: env.BETTER_AUTH_SECRET,
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

      const result = await sendEmail({
        from: getFromAddress(),
        to: user.email,
        subject: `Verify your ${env.APP_NAME} account`,
        html: `<p>Hello ${user.name || 'there'},</p><p>Please verify your email address by visiting <a href="${url}">${url}</a>.</p>`,
        text: `Hello ${user.name || 'there'},\n\nPlease verify your email address by visiting:\n${url}`
      });

      if (!result.success) {
        throw new Error(result.error || 'Failed to send verification email');
      }

      if (getProvider() === 'console') {
        // biome-ignore lint/suspicious/noConsole: intentional — dev-only verification URL display
        console.info(`[auth] Verification URL: ${url}`);
      }
    }
  },
  socialProviders: githubEnabled
    ? {
        github: {
          clientId: env.GITHUB_CLIENT_ID,
          clientSecret: env.GITHUB_CLIENT_SECRET
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

        const acceptUrl = `${env.APP_URL}/orgs/accept-invitation?id=${data.id}`;
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
                providerId: env.OIDC_PROVIDER_ID,
                clientId: env.OIDC_CLIENT_ID,
                clientSecret: env.OIDC_CLIENT_SECRET,
                discoveryUrl: env.OIDC_DISCOVERY_URL || undefined,
                authorizationUrl: env.OIDC_AUTHORIZATION_URL || undefined,
                tokenUrl: env.OIDC_TOKEN_URL || undefined,
                userInfoUrl: env.OIDC_USER_INFO_URL || undefined,
                scopes: ['openid', 'profile', 'email']
              }
            ]
          })
        ]
      : [])
  ]
});
