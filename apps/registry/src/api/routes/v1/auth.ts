import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';

import { verifyCliAuth } from '~/lib/auth/authz';

const whoamiRoute = createRoute({
  method: 'get',
  path: '/whoami',
  tags: ['Auth'],
  summary: 'Get current user info',
  description: 'Returns the authenticated user profile associated with the provided API key.',
  security: [{ BearerAuth: [] }],
  responses: {
    200: {
      description: 'Authenticated user info',
      content: {
        'application/json': {
          schema: z.object({
            userId: z.string(),
            name: z.string().nullable(),
            email: z.string().nullable()
          })
        }
      }
    },
    401: {
      description: 'Unauthorized',
      content: {
        'application/json': {
          schema: z.object({ error: z.string() })
        }
      }
    },
    404: {
      description: 'User not found',
      content: {
        'application/json': {
          schema: z.object({ error: z.string() })
        }
      }
    },
    503: {
      description: 'Authentication temporarily unavailable; retry the request',
      content: { 'application/json': { schema: z.object({ error: z.string() }) } }
    }
  }
});

export const authRoutes = new OpenAPIHono().openapi(whoamiRoute, async (c) => {
  const verified = await verifyCliAuth(c.req.raw);
  if (!verified) {
    return c.json({ error: 'Unauthorized. Valid API key required.' }, 401);
  }

  const row = verified.owner;
  return c.json({ userId: row.id, name: row.name, email: row.email }, 200);
});
