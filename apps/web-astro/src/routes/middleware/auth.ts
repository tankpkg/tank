import { createMiddleware } from 'hono/factory';

// Placeholder — will wire better-auth session extraction in Phase 1
export const requireSession = createMiddleware(async (_c, next) => {
  // TODO: const session = await auth.api.getSession({ headers: c.req.raw.headers });
  // if (!session) return c.json({ error: 'Unauthorized' }, 401);
  // c.set('user', session.user);
  // c.set('session', session.session);
  await next();
});
