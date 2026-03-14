import { createMiddleware } from 'hono/factory';

// Placeholder — will check admin role in Phase 1
export const requireAdmin = createMiddleware(async (_c, next) => {
  // TODO: check c.var.user.role === 'admin'
  await next();
});
