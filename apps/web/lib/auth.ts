import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { nextCookies } from 'better-auth/next-js';
import { apiKey, genericOAuth, organization } from 'better-auth/plugins';
import { db } from './db';
import { sendEmail, getFromAddress, getProvider } from './email/service';
import { checkVerificationRateLimit } from './email/rate-limiter';

const enabledProviders = new Set(
  (process.env.AUTH_PROVIDERS || 'github,credentials')
    .split(',')
    .map((provider) => provider.trim().toLowerCase())
    .filter(Boolean),
);

const githubEnabled = enabledProviders.has('github')
  && !!process.env.GITHUB_CLIENT_ID
  && !!process.env.GITHUB_CLIENT_SECRET;

const oidcEnabled = enabledProviders.has('oidc')
  && !!process.env.OIDC_CLIENT_ID
  && !!process.env.OIDC_CLIENT_SECRET
  && (
    !!process.env.OIDC_DISCOVERY_URL
    || (!!process.env.OIDC_AUTHORIZATION_URL && !!process.env.OIDC_TOKEN_URL && !!process.env.OIDC_USER_INFO_URL)
  );

const oidcProviderId = process.env.OIDC_PROVIDER_ID || 'enterprise-oidc';

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: 'pg',
  }),

  baseURL: process.env.BETTER_AUTH_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
  secret: process.env.BETTER_AUTH_SECRET,

  emailAndPassword: {
    enabled: enabledProviders.has('credentials'),
    requireEmailVerification: enabledProviders.has('credentials'),
  },

  emailVerification: {
    sendOnSignUp: enabledProviders.has('credentials'),
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      const rateLimit = await checkVerificationRateLimit(user.email)
      if (!rateLimit.allowed) {
        throw new Error(`Too many verification emails. Please wait ${Math.ceil(rateLimit.resetIn / 60000)} minutes before requesting another.`)
      }

      const from = getFromAddress()
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
      const appName = process.env.APP_NAME || 'Tank'

      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 24px;">${appName}</h1>
          </div>
          <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px;">
            <p style="margin-bottom: 20px;">Hello ${user.name || 'there'},</p>
            <p style="margin-bottom: 20px;">Please verify your email address by clicking the button below:</p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${url}" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">Verify Email</a>
            </div>
            <p style="margin-bottom: 20px; color: #666; font-size: 14px;">Or copy this link to your browser:<br><code style="word-break: break-all; background: #eee; padding: 5px; border-radius: 3px;">${url}</code></p>
            <p style="margin-bottom: 0; color: #999; font-size: 12px;">This link will expire in 24 hours. If you didn't request this email, you can safely ignore it.</p>
          </div>
        </body>
        </html>
      `

      const text = `Hello ${user.name || 'there'},\n\nPlease verify your email address by visiting:\n${url}\n\nThis link will expire in 24 hours. If you didn't request this email, you can safely ignore it.`

      const result = await sendEmail({
        from,
        to: user.email,
        subject: `Verify your ${appName} account`,
        html,
        text,
      })

      if (!result.success) {
        console.error(`Failed to send verification email to ${user.email}:`, result.error)
        throw new Error('Failed to send verification email. Please try again later.')
      }

      if (getProvider() === 'console') {
        console.log(`Email verification link for ${user.email}: ${url}`)
      }
    },
  },

  socialProviders: githubEnabled
    ? {
        github: {
          clientId: process.env.GITHUB_CLIENT_ID!,
          clientSecret: process.env.GITHUB_CLIENT_SECRET!,
        },
      }
    : {},

  plugins: [
    apiKey({
      defaultPrefix: 'tank_',
    }),
    organization({
      allowUserToCreateOrganization: true,
    }),
    ...(oidcEnabled
      ? [
          genericOAuth({
            config: [
              {
                providerId: oidcProviderId,
                clientId: process.env.OIDC_CLIENT_ID!,
                clientSecret: process.env.OIDC_CLIENT_SECRET!,
                discoveryUrl: process.env.OIDC_DISCOVERY_URL,
                authorizationUrl: process.env.OIDC_AUTHORIZATION_URL,
                tokenUrl: process.env.OIDC_TOKEN_URL,
                userInfoUrl: process.env.OIDC_USER_INFO_URL,
                scopes: ['openid', 'profile', 'email'],
              },
            ],
          }),
        ]
      : []),
    nextCookies(),
  ],
});
