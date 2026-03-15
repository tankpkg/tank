import { Hono } from 'hono';

import { resolveRequestUserId } from '~/lib/auth/authz';
import { searchSkills } from '~/lib/skills/data';

export const searchRoutes = new Hono().get('/', async (c) => {
  const requesterUserId = await resolveRequestUserId(c.req.raw);
  const q = c.req.query('q') ?? '';
  const page = Math.max(1, Number.parseInt(c.req.query('page') ?? '1', 10) || 1);
  const limit = Math.min(50, Math.max(1, Number.parseInt(c.req.query('limit') ?? '20', 10) || 20));

  const data = await searchSkills(q, page, limit, requesterUserId);

  return c.json(data);
});
