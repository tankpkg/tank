import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { eq } from 'drizzle-orm';

import { verifyCliAuth } from '~/lib/auth/authz';
import { db } from '~/lib/db';
import { user } from '~/lib/db/auth-schema';

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
    }
  }
});

export const authRoutes = new OpenAPIHono().openapi(whoamiRoute, async (c) => {
  const verified = await verifyCliAuth(c.req.raw);
  if (!verified) {
    return c.json({ error: 'Unauthorized. Valid API key required.' }, 401);
  }

  const rows = await db
    .select({ id: user.id, name: user.name, email: user.email })
    .from(user)
    .where(eq(user.id, verified.userId))
    .limit(1);

  if (rows.length === 0) {
    return c.json({ error: 'User not found' }, 404);
  }

  const row = rows[0];
  return c.json({ userId: row.id, name: row.name, email: row.email }, 200);
});
