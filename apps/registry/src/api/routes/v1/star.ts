import { and, eq, sql } from 'drizzle-orm';
import { Hono } from 'hono';

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

export const starRoutes = new Hono()

  .get('/:name{.+}/star', async (c) => {
    const name = decodeURIComponent(c.req.param('name'));
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

    return c.json({ count, isStarred });
  })

  .post('/:name{.+}/star', async (c) => {
    const session = await getSessionFromRequest(c.req.raw);
    if (!session?.user?.id) return c.json({ error: 'Authentication required' }, 401);

    const name = decodeURIComponent(c.req.param('name'));
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

    return c.json({ success: true });
  })

  .delete('/:name{.+}/star', async (c) => {
    const session = await getSessionFromRequest(c.req.raw);
    if (!session?.user?.id) return c.json({ error: 'Authentication required' }, 401);

    const name = decodeURIComponent(c.req.param('name'));
    const skillId = await resolveSkillId(name);
    if (!skillId) return c.json({ error: 'Skill not found' }, 404);

    await db.delete(skillStars).where(and(eq(skillStars.skillId, skillId), eq(skillStars.userId, session.user.id)));

    return c.json({ success: true });
  });
