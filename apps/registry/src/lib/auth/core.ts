import { AsyncLocalStorage } from 'node:async_hooks';

import { API_KEY_TABLE_NAME, apiKey } from '@better-auth/api-key';
import { type BetterAuthOptions, betterAuth, type DBAdapter, type DBTransactionAdapter } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { APIError, createAuthMiddleware, setShouldSkipSessionRefresh } from 'better-auth/api';
import { genericOAuth, organization } from 'better-auth/plugins';
import { eq } from 'drizzle-orm';
import { enabledProviders, env, githubEnabled, oidcEnabled } from '~/consts/env';
import { getAppUrl } from '~/lib/app-url';
import {
  ApiKeyDeletionConflict,
  allowLegacyApiKeyRevocation,
  assertUserDeletionSafe,
  claimDeferredApiKeyVerification,
  isApiKeyLockTimeout,
  lockServiceAccounts,
  ServiceAccountDeletionConflict,
  ServiceAccountSafetyUnavailable,
  takeApiKeyCleanupFailure,
  takeApiKeyManagementFailure,
  withApiKeyRequest,
  withApiKeyWriteLock,
  withFreshApiKeyRequest,
  withSafeApiKeys
} from '~/lib/auth/api-key-safety';
import { db } from '~/lib/db';
import { user } from '~/lib/db/auth-schema';
import { checkEmailRateLimit, checkVerificationRateLimit } from '~/services/email/rate-limiter';
import { getFromAddress, getProvider, sendEmail } from '~/services/email/service';

// The API-key plugin writes directly through the adapter, bypassing databaseHooks.
// This adapter is for the single user-scoped API-key configuration below.
function withApiKeyOwner(adapter: DBTransactionAdapter): DBTransactionAdapter {
  return {
    ...adapter,
    create(input) {
      if (input.model !== API_KEY_TABLE_NAME) return adapter.create(input);
      const referenceId: unknown = Reflect.get(input.data, 'referenceId');
      const userId: unknown = Reflect.get(input.data, 'userId');
      const configId: unknown = Reflect.get(input.data, 'configId');
      if (
        typeof referenceId !== 'string' ||
        !referenceId ||
        (userId != null && userId !== referenceId) ||
        (configId != null && configId !== 'default')
      ) {
        throw new Error('API key requires a matching user reference');
      }
      return adapter.create({ ...input, data: { ...input.data, userId: referenceId } });
    }
  };
}

function createAuthAdapter(
  options: BetterAuthOptions,
  transactions: AsyncLocalStorage<DBTransactionAdapter>
): DBAdapter {
  const adapter = drizzleAdapter(db, { provider: 'pg' })(options);
  const wrapped: DBAdapter = {
    ...withSafeApiKeys(withApiKeyOwner(adapter)),
    transaction: (callback) =>
      adapter.transaction((transaction) => callback(withSafeApiKeys(withApiKeyOwner(transaction), true)))
  };
  return new Proxy(wrapped, {
    get(target, property) {
      const selected = transactions.getStore() ?? target;
      const value: unknown = Reflect.get(selected, property, selected);
      return typeof value === 'function' ? value.bind(selected) : value;
    }
  });
}

function managementError(failure: NonNullable<ReturnType<typeof takeApiKeyManagementFailure>>): APIError {
  return failure === 'timeout'
    ? APIError.fromStatus('SERVICE_UNAVAILABLE', {
        code: 'API_KEY_LOCK_TIMEOUT',
        message: 'Please retry the key operation.'
      })
    : APIError.fromStatus('CONFLICT', {
        code: 'API_KEY_OWNERSHIP_CONFLICT',
        message: 'API-key ownership or policy changed.'
      });
}

function managementResponse(response: Response): Response {
  const failure = takeApiKeyManagementFailure();
  if (!failure || response.status !== 500) return response;
  const error = managementError(failure);
  const headers = new Headers(response.headers);
  headers.delete('content-length');
  return Response.json(error.body, { status: error.statusCode, headers });
}

function verificationFailure(result: unknown): APIError | undefined {
  if (!result || typeof result !== 'object') return;
  const detail: unknown = Reflect.get(result, 'error');
  if (!detail || typeof detail !== 'object') return;
  const code: unknown = Reflect.get(detail, 'code');
  if (
    code !== 'SERVICE_ACCOUNT_SAFETY_UNAVAILABLE' &&
    code !== 'API_KEY_VERIFICATION_UNAVAILABLE' &&
    code !== 'API_KEY_LOCK_TIMEOUT'
  )
    return;
  return APIError.fromStatus('SERVICE_UNAVAILABLE', {
    code,
    message: 'API-key verification temporarily unavailable. Please retry or contact an administrator.'
  });
}

async function normalizeVerificationResponse(response: unknown): Promise<unknown> {
  if (!(response instanceof Response)) {
    const error = verificationFailure(response);
    if (error) throw error;
    return response;
  }
  let body: unknown;
  try {
    body = await response.clone().json();
  } catch {
    return response;
  }
  const error = verificationFailure(body);
  if (!error) return response;
  const headers = new Headers(response.headers);
  headers.delete('content-length');
  return Response.json(error.body, { status: error.statusCode, headers });
}

function createAuth() {
  const transactions = new AsyncLocalStorage<DBTransactionAdapter>();
  const isSelfHosted = process.env.TANK_MODE === 'selfhosted';
  const emailBackendConfigured = !!process.env.RESEND_API_KEY || !!process.env.SMTP_HOST;
  const credentialsEnabled = enabledProviders.has('credentials');
  // Email verification only meaningful when there's a real backend to send from.
  // Without one, sendEmail's `console` provider returns success without sending,
  // leaving the user permanently unverified. Auto-verify in that case (matches
  // self-hosted behavior) and warn loudly so ops can fix the misconfig.
  const requireEmailVerification = credentialsEnabled && !isSelfHosted && emailBackendConfigured;
  if (credentialsEnabled && !isSelfHosted && !emailBackendConfigured) {
    // biome-ignore lint/suspicious/noConsole: startup misconfig warning — must be visible
    console.warn(
      '[auth] No email backend configured (RESEND_API_KEY or SMTP_HOST). Email verification SKIPPED. ' +
        'Configure email to enable verification at sign-up.'
    );
  }

  const instance = betterAuth({
    database: (options: BetterAuthOptions) => createAuthAdapter(options, transactions),
    baseURL: getAppUrl(),
    basePath: '/api/auth',
    secret: process.env.BETTER_AUTH_SECRET || env.BETTER_AUTH_SECRET,
    hooks: {
      before: createAuthMiddleware(async (context) => {
        if (context.path === '/api-key/delete') {
          const body: unknown = context.body;
          allowLegacyApiKeyRevocation(body && typeof body === 'object' ? Reflect.get(body, 'configId') : undefined);
        }
        if (context.path === '/delete-user' || context.path === '/delete-user/callback') {
          await setShouldSkipSessionRefresh(true);
        }
      })
    },
    emailAndPassword: {
      enabled: credentialsEnabled,
      requireEmailVerification
    },
    emailVerification: {
      sendOnSignUp: requireEmailVerification,
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
      apiKey({ defaultPrefix: 'tank_', references: 'user', storage: 'database', disableKeyHashing: false }),
      // Include the legacy column in Better Auth's adapter input transformation.
      {
        id: 'tank-api-key-owner',
        schema: {
          apikey: {
            fields: { userId: { type: 'string', required: false, input: false, returned: false } }
          }
        }
      },
      organization({
        allowUserToCreateOrganization: true,
        async sendInvitationEmail(data) {
          const rateLimit = await checkEmailRateLimit(data.email);
          if (!rateLimit.allowed) {
            throw new Error(`Too many emails sent. Please wait ${Math.ceil(rateLimit.resetIn / 60000)} minutes.`);
          }

          const acceptUrl = `${getAppUrl()}/orgs/accept-invitation?id=${data.id}`;
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
  const ready = instance.$context.then((context) => {
    const deleteUser = context.internalAdapter.deleteUser.bind(context.internalAdapter);
    context.internalAdapter.deleteUser = async (userId) => {
      try {
        await withApiKeyWriteLock(
          async (tx) => {
            await assertUserDeletionSafe(tx, userId);
            const adapter = drizzleAdapter(tx, { provider: 'pg' })(context.options);
            const scoped = withSafeApiKeys(withApiKeyOwner(adapter), true);
            await transactions.run(scoped, () => deleteUser(userId));
            if ((await tx.select({ id: user.id }).from(user).where(eq(user.id, userId)).limit(1)).length) {
              throw new Error('User deletion did not complete');
            }
          },
          undefined,
          lockServiceAccounts
        );
      } catch (error) {
        if (error instanceof ApiKeyDeletionConflict) {
          throw APIError.fromStatus('CONFLICT', { code: 'API_KEY_OWNERSHIP_CONFLICT', message: error.message });
        }
        if (error instanceof ServiceAccountDeletionConflict) {
          throw APIError.fromStatus('CONFLICT', { code: 'SERVICE_ACCOUNT_OWNERSHIP_CONFLICT', message: error.message });
        }
        if (error instanceof ServiceAccountSafetyUnavailable) {
          throw APIError.fromStatus('SERVICE_UNAVAILABLE', {
            code: 'SERVICE_ACCOUNT_SAFETY_UNAVAILABLE',
            message: error.message
          });
        }
        if (isApiKeyLockTimeout(error)) {
          throw APIError.fromStatus('SERVICE_UNAVAILABLE', {
            code: 'API_KEY_LOCK_TIMEOUT',
            message: 'Please retry deletion.'
          });
        }
        throw error;
      }
    };
    return context;
  });
  return {
    ...instance,
    $context: ready,
    handler: async (request: Request) => {
      await ready;
      return withFreshApiKeyRequest(async () => {
        const response = await instance.handler(request);
        const path = new URL(request.url).pathname;
        return path === '/api/auth/api-key/delete' || path === '/api/auth/api-key/update'
          ? managementResponse(response)
          : response;
      }, request.signal);
    },
    api: new Proxy(instance.api, {
      get(target, property) {
        const value: unknown = Reflect.get(target, property, target);
        if (typeof value !== 'function') return value;
        return (...args: unknown[]) => {
          const reuse = property === 'verifyApiKey' && claimDeferredApiKeyVerification();
          const scope = reuse ? withApiKeyRequest : withFreshApiKeyRequest;
          return ready.then(() =>
            scope(async () => {
              try {
                if (property === 'deleteAllExpiredApiKeys') takeApiKeyCleanupFailure();
                const response: unknown = await Reflect.apply(value, target, args);
                if (property === 'verifyApiKey') return normalizeVerificationResponse(response);
                const cleanupFailure = property === 'deleteAllExpiredApiKeys' ? takeApiKeyCleanupFailure() : undefined;
                if (cleanupFailure) {
                  const error =
                    cleanupFailure === 'timeout'
                      ? APIError.fromStatus('SERVICE_UNAVAILABLE', {
                          code: 'API_KEY_LOCK_TIMEOUT',
                          message: 'Please retry cleanup.'
                        })
                      : APIError.fromStatus('INTERNAL_SERVER_ERROR', {
                          code: 'API_KEY_CLEANUP_FAILED',
                          message: 'API-key cleanup failed.'
                        });
                  if (response instanceof Response) return Response.json(error.body, { status: error.statusCode });
                  throw error;
                }
                return response instanceof Response && (property === 'deleteApiKey' || property === 'updateApiKey')
                  ? managementResponse(response)
                  : response;
              } catch (error) {
                if (property === 'deleteApiKey' || property === 'updateApiKey') {
                  const failure = takeApiKeyManagementFailure();
                  if (failure) throw managementError(failure);
                }
                throw error;
              }
            })
          );
        };
      }
    })
  };
}

type AuthInstance = ReturnType<typeof createAuth>;
let _auth: AuthInstance | null = null;

export function resetAuth(): void {
  _auth = null;
}

export const auth = new Proxy({} as AuthInstance, {
  get(_, prop) {
    if (!_auth) _auth = createAuth();
    return Reflect.get(_auth, prop, _auth);
  }
});
