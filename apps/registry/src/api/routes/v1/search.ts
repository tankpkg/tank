import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';

import { resolveRequestUserId } from '~/lib/auth/authz';
import { searchSkills } from '~/lib/skills/data';

const searchRoute = createRoute({
  method: 'get',
  path: '/',
  tags: ['Search'],
  summary: 'Search packages',
  description: 'Search the registry for packages by keyword. Supports pagination.',
  request: {
    query: z.object({
      q: z.string().optional().openapi({ description: 'Search query', example: 'react' }),
      page: z.coerce.number().int().min(1).optional().openapi({ description: 'Page number (default: 1)' }),
      limit: z.coerce
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .openapi({ description: 'Results per page (default: 20, max: 50)' })
    })
  },
  responses: {
    200: {
      description: 'Search results',
      content: {
        'application/json': {
          schema: z
            .object({
              results: z.array(z.any()),
              total: z.number(),
              page: z.number(),
              limit: z.number()
            })
            .passthrough()
        }
      }
    }
  }
});

export const searchRoutes = new OpenAPIHono().openapi(searchRoute, async (c) => {
  const requesterUserId = await resolveRequestUserId(c.req.raw);
  const { q, page: rawPage, limit: rawLimit } = c.req.valid('query');
  const query = q ?? '';
  const page = Math.max(1, rawPage ?? 1);
  const limit = Math.min(50, Math.max(1, rawLimit ?? 20));

  const data = await searchSkills(query, page, limit, requesterUserId);

  return c.json(data, 200);
});
