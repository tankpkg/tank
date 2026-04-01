import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { getAppUrl } from '~/lib/app-url';
import { isUserBlocked } from '~/lib/auth/authz';
import { authorizeSession, consumeSession, createSession, getSession } from '~/lib/auth/cli-store';
import { auth } from '~/lib/auth/core';
import { authLog } from '~/services/logger';

const startSchema = z.object({
  state: z.string().min(8).max(256).openapi({ description: 'Random state string for CSRF protection' })
});
const authorizeSchema = z.object({
  sessionCode: z.string().uuid().openapi({ description: 'Session code from /start' })
});
const exchangeSchema = z.object({
  sessionCode: z.string().uuid().openapi({ description: 'Session code from /start' }),
  state: z.string().min(8).max(256).openapi({ description: 'Must match the state from /start' })
});

const startRoute = createRoute({
  method: 'post',
  path: '/start',
  tags: ['CLI Auth'],
  summary: 'Start CLI authentication flow',
  description: 'Creates a pending CLI auth session. The user opens the returned authUrl in a browser to approve.',
  request: {
    body: {
      content: {
        'application/json': { schema: startSchema }
      }
    }
  },
  responses: {
    200: {
      description: 'Auth session created',
      content: {
        'application/json': {
          schema: z.object({
            authUrl: z.string().url(),
            sessionCode: z.string().uuid()
          })
        }
      }
    },
    400: {
      description: 'Invalid request',
      content: {
        'application/json': {
          schema: z.object({ error: z.string() })
        }
      }
    }
  }
});

const authorizeRoute = createRoute({
  method: 'post',
  path: '/authorize',
  tags: ['CLI Auth'],
  summary: 'Authorize a CLI session',
  description: 'Called from the web UI after the user approves the CLI login. Requires an active web session.',
  security: [{ BearerAuth: [] }],
  request: {
    body: {
      content: {
        'application/json': { schema: authorizeSchema }
      }
    }
  },
  responses: {
    200: {
      description: 'Session authorized',
      content: {
        'application/json': {
          schema: z.object({ success: z.literal(true) })
        }
      }
    },
    400: {
      description: 'Invalid request or session could not be authorized',
      content: {
        'application/json': {
          schema: z.object({ error: z.string() })
        }
      }
    },
    401: {
      description: 'No web session',
      content: {
        'application/json': {
          schema: z.object({ error: z.string() })
        }
      }
    },
    403: {
      description: 'Account suspended',
      content: {
        'application/json': {
          schema: z.object({ error: z.string() })
        }
      }
    },
    404: {
      description: 'Session not found or expired',
      content: {
        'application/json': {
          schema: z.object({ error: z.string() })
        }
      }
    }
  }
});

const exchangeRoute = createRoute({
  method: 'post',
  path: '/exchange',
  tags: ['CLI Auth'],
  summary: 'Exchange session for API token',
  description: 'Exchanges an authorized CLI session code for a long-lived API token.',
  request: {
    body: {
      content: {
        'application/json': { schema: exchangeSchema }
      }
    }
  },
  responses: {
    200: {
      description: 'Token issued',
      content: {
        'application/json': {
          schema: z.object({
            token: z.string(),
            user: z.object({
              name: z.string().nullable(),
              email: z.string().nullable()
            })
          })
        }
      }
    },
    400: {
      description: 'Invalid or expired session',
      content: {
        'application/json': {
          schema: z.object({ error: z.string() })
        }
      }
    },
    403: {
      description: 'Account suspended',
      content: {
        'application/json': {
          schema: z.object({ error: z.string() })
        }
      }
    },
    500: {
      description: 'Failed to create API key',
      content: {
        'application/json': {
          schema: z.object({ error: z.string() })
        }
      }
    }
  }
});

export const cliAuthRoutes = new OpenAPIHono()

  .openapi(startRoute, async (c) => {
    try {
      const { state } = c.req.valid('json');

      authLog.info({ action: 'start', state: `${state.slice(0, 8)}...` }, 'CLI auth start request received');

      const sessionCode = await createSession(state);

      const baseUrl = getAppUrl(c);
      const authUrl = `${baseUrl}/cli-login?session=${sessionCode}`;

      authLog.info(
        { action: 'start', sessionCode: `${sessionCode.slice(0, 8)}...`, authUrl },
        'Session created successfully'
      );

      return c.json({ authUrl, sessionCode }, 200);
    } catch (err) {
      authLog.error(
        {
          action: 'start',
          error: err instanceof Error ? err.message : String(err),
          stack: err instanceof Error ? err.stack : undefined
        },
        'CLI auth start failed'
      );
      return c.json({ error: 'Invalid request body' }, 400);
    }
  })

  .openapi(authorizeRoute, async (c) => {
    try {
      authLog.info({ action: 'authorize' }, 'CLI auth authorize request received');

      const session = await auth.api.getSession({ headers: c.req.raw.headers });

      authLog.info({ action: 'authorize', userId: session?.user?.id, hasSession: !!session }, 'Auth session check');

      if (!session?.user?.id) {
        authLog.warn({ action: 'authorize' }, 'No authenticated session found');
        return c.json({ error: 'Authentication required' }, 401);
      }

      if (await isUserBlocked(session.user.id)) {
        return c.json({ error: 'Account is suspended or banned' }, 403);
      }

      const { sessionCode } = c.req.valid('json');

      authLog.info(
        { action: 'authorize', sessionCode: `${sessionCode.slice(0, 8)}...` },
        'Authorize attempt for session'
      );

      const cliSession = await getSession(sessionCode);
      if (!cliSession) {
        authLog.warn(
          { action: 'authorize', sessionCode: `${sessionCode.slice(0, 8)}...` },
          'Session not found or expired'
        );
        return c.json({ error: 'Invalid or expired session' }, 404);
      }

      const success = await authorizeSession(sessionCode, session.user.id, {
        name: session.user.name,
        email: session.user.email
      });
      if (!success) {
        authLog.error(
          { action: 'authorize', sessionCode: `${sessionCode.slice(0, 8)}...` },
          'Session authorization failed'
        );
        return c.json({ error: 'Session could not be authorized' }, 400);
      }

      authLog.info(
        { action: 'authorize', sessionCode: `${sessionCode.slice(0, 8)}...`, userId: session.user.id },
        'Session authorized successfully'
      );

      return c.json({ success: true as const }, 200);
    } catch (err) {
      authLog.error(
        {
          action: 'authorize',
          error: err instanceof Error ? err.message : String(err),
          stack: err instanceof Error ? err.stack : undefined
        },
        'CLI auth authorize failed'
      );
      return c.json({ error: 'Invalid request body' }, 400);
    }
  })

  .openapi(exchangeRoute, async (c) => {
    try {
      authLog.info({ action: 'exchange' }, 'CLI auth exchange request received');

      const { sessionCode, state } = c.req.valid('json');

      const session = await consumeSession(sessionCode, state);
      authLog.info(
        {
          action: 'exchange',
          sessionCode: `${sessionCode.slice(0, 8)}...`,
          consumed: !!session,
          state: `${state.slice(0, 8)}...`
        },
        'Exchange attempt'
      );

      if (!session) {
        authLog.warn(
          { action: 'exchange', sessionCode: `${sessionCode.slice(0, 8)}...` },
          'Session invalid, expired, or already used'
        );
        return c.json({ error: 'Invalid, expired, or already used session code' }, 400);
      }

      if (!session.userId) {
        authLog.warn(
          { action: 'exchange', sessionCode: `${sessionCode.slice(0, 8)}...` },
          'Session not properly authorized'
        );
        return c.json({ error: 'Session was not properly authorized' }, 400);
      }

      if (await isUserBlocked(session.userId)) {
        return c.json({ error: 'Account is suspended or banned' }, 403);
      }

      const apiKeyResult = await auth.api.createApiKey({
        body: {
          name: 'CLI Token',
          userId: session.userId,
          expiresIn: 90 * 24 * 60 * 60,
          rateLimitMax: 1000
        }
      });

      authLog.info(
        {
          action: 'exchange',
          sessionCode: `${sessionCode.slice(0, 8)}...`,
          userId: session.userId,
          hasKey: !!apiKeyResult?.key
        },
        'API key creation result'
      );

      if (!apiKeyResult?.key) {
        authLog.error({ action: 'exchange' }, 'Failed to create API key');
        return c.json({ error: 'Failed to create API key' }, 500);
      }

      authLog.info(
        { action: 'exchange', userId: session.userId },
        'Exchange completed successfully - user authenticated via CLI'
      );

      return c.json(
        {
          token: apiKeyResult.key,
          user: {
            name: session.userName ?? null,
            email: session.userEmail ?? null
          }
        },
        200
      );
    } catch (err) {
      authLog.error(
        {
          action: 'exchange',
          error: err instanceof Error ? err.message : String(err),
          stack: err instanceof Error ? err.stack : undefined
        },
        'CLI auth exchange failed'
      );
      return c.json({ error: 'Invalid request body' }, 400);
    }
  });
