import { Hono } from 'hono';

// Placeholder — admin routes will be ported in Phase 1
export const adminRoutes = new Hono();

adminRoutes.get('/', (c) => {
  return c.json({ admin: true, status: 'scaffold' });
});
