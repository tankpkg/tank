import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { and, eq, sql } from 'drizzle-orm';

import { getSessionFromRequest } from '~/lib/auth/authz';
import { db } from '~/lib/db';
import { skillStars, skills } from '~/lib/db/schema';

async function resolveSkillId(name: string) {
  const rows = await db.select({ id: skills.id }).from(skills).where(eq(skills.name, name)).limit(1);
  return rows[0]?.id ?? null;
}

async function getStarCount(skillId: string): Promise<number> {
  const rows = await db.execute(sql`SELECT count(*)::int AS count FROM skill_stars WHERE skill_id = ${skillId}`);
  return (rows[0] as Record<string, unknown>).count as number;
}

const nameParam = z.object({
  name: z.string().openapi({
    description: 'Skill name (URL-encoded, supports scoped names like @org/skill)',
    example: '@tank/react'
  })
});

const getStarRoute = createRoute({
  method: 'get',
  path: '/{name}/star',
  tags: ['Stars'],
  summary: 'Get star count',
  description: 'Returns the star count for a skill and whether the current user has starred it.',
  request: { params: nameParam },
  responses: {
    200: {
      description: 'Star info',
      content: {
        'application/json': {
          schema: z.object({
            count: z.number(),
            isStarred: z.boolean()
          })
        }
      }
    },
    404: {
      description: 'Skill not found',
      content: {
        'application/json': {
          schema: z.object({ error: z.string() })
        }
      }
    }
  }
});

const postStarRoute = createRoute({
  method: 'post',
  path: '/{name}/star',
  tags: ['Stars'],
  summary: 'Star a skill',
  description: 'Add a star to a skill. Requires authentication.',
  security: [{ BearerAuth: [] }],
  request: { params: nameParam },
  responses: {
    200: {
      description: 'Star added',
      content: {
        'application/json': {
          schema: z.object({ success: z.literal(true) })
        }
      }
    },
    401: {
      description: 'Authentication required',
      content: {
        'application/json': {
          schema: z.object({ error: z.string() })
        }
      }
    },
    404: {
      description: 'Skill not found',
      content: {
        'application/json': {
          schema: z.object({ error: z.string() })
        }
      }
    }
  }
});

const deleteStarRoute = createRoute({
  method: 'delete',
  path: '/{name}/star',
  tags: ['Stars'],
  summary: 'Unstar a skill',
  description: 'Remove a star from a skill. Requires authentication.',
  security: [{ BearerAuth: [] }],
  request: { params: nameParam },
  responses: {
    200: {
      description: 'Star removed',
      content: {
        'application/json': {
          schema: z.object({ success: z.literal(true) })
        }
      }
    },
    401: {
      description: 'Authentication required',
      content: {
        'application/json': {
          schema: z.object({ error: z.string() })
        }
      }
    },
    404: {
      description: 'Skill not found',
      content: {
        'application/json': {
          schema: z.object({ error: z.string() })
        }
      }
    }
  }
});

export const starRoutes = new OpenAPIHono()

  .openapi(getStarRoute, async (c) => {
    const { name: rawName } = c.req.valid('param');
    const name = decodeURIComponent(rawName);
    const skillId = await resolveSkillId(name);
    if (!skillId) return c.json({ error: 'Skill not found' }, 404);

    const count = await getStarCount(skillId);

    let isStarred = false;
    const session = await getSessionFromRequest(c.req.raw);
    if (session?.user?.id) {
      const rows = await db
        .select({ id: skillStars.id })
        .from(skillStars)
        .where(and(eq(skillStars.skillId, skillId), eq(skillStars.userId, session.user.id)))
        .limit(1);
      isStarred = rows.length > 0;
    }

    return c.json({ count, isStarred }, 200);
  })

  .openapi(postStarRoute, async (c) => {
    const session = await getSessionFromRequest(c.req.raw);
    if (!session?.user?.id) return c.json({ error: 'Authentication required' }, 401);

    const { name: rawName } = c.req.valid('param');
    const name = decodeURIComponent(rawName);
    const skillId = await resolveSkillId(name);
    if (!skillId) return c.json({ error: 'Skill not found' }, 404);

    const existing = await db
      .select({ id: skillStars.id })
      .from(skillStars)
      .where(and(eq(skillStars.skillId, skillId), eq(skillStars.userId, session.user.id)))
      .limit(1);

    if (existing.length === 0) {
      await db.insert(skillStars).values({ skillId, userId: session.user.id });
    }

    return c.json({ success: true as const }, 200);
  })

  .openapi(deleteStarRoute, async (c) => {
    const session = await getSessionFromRequest(c.req.raw);
    if (!session?.user?.id) return c.json({ error: 'Authentication required' }, 401);

    const { name: rawName } = c.req.valid('param');
    const name = decodeURIComponent(rawName);
    const skillId = await resolveSkillId(name);
    if (!skillId) return c.json({ error: 'Skill not found' }, 404);

    await db.delete(skillStars).where(and(eq(skillStars.skillId, skillId), eq(skillStars.userId, session.user.id)));

    return c.json({ success: true as const }, 200);
  });
