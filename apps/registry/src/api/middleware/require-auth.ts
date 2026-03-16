import type { MiddlewareHandler } from 'hono';

import { isUserBlocked, resolveRequestUserId } from '~/lib/auth/authz';

export function requireAuth(): MiddlewareHandler {
  return async (c, next) => {
    const userId = await resolveRequestUserId(c.req.raw);
    if (!userId) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    if (await isUserBlocked(userId)) {
      return c.json({ error: 'Account suspended' }, 403);
    }
    c.set('userId', userId);
    await next();
  };
}
