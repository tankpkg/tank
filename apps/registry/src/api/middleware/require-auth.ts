import type { MiddlewareHandler } from 'hono';

import { getSessionFromRequest, isUserBlocked, readAuthenticationData, verifyCliAuth } from '~/lib/auth/authz';

export function requireAuth(): MiddlewareHandler {
  return async (c, next) => {
    const verified = await verifyCliAuth(c.req.raw);
    const session = !verified && !c.req.raw.signal.aborted ? await getSessionFromRequest(c.req.raw) : null;
    const userId = verified?.userId ?? session?.user.id;
    if (!userId) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    if (!verified && (await readAuthenticationData(() => isUserBlocked(userId)))) {
      return c.json({ error: 'Account suspended' }, 403);
    }
    if (c.req.raw.signal.aborted) {
      return c.json({ error: 'Request cancelled.' }, 408);
    }
    c.set('userId', userId);
    await next();
  };
}
