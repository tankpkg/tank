import type { MiddlewareHandler } from 'hono';

import { getSessionFromRequest, isAdmin } from '~/lib/auth-helpers';

export function requireAdmin(): MiddlewareHandler {
  return async (c, next) => {
    const session = await getSessionFromRequest(c.req.raw);
    if (!session) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    if (!(await isAdmin(session.user.id))) {
      return c.json({ error: 'Forbidden' }, 403);
    }
    c.set('adminUser', session.user);
    c.set('adminSession', session.session);
    await next();
  };
}
