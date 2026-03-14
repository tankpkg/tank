import { Hono } from 'hono';

// Placeholder — will mount better-auth handler in Phase 1
export const authRoutes = new Hono();

authRoutes.all('/*', (c) => {
  return c.json({ error: 'Auth not yet configured' }, 501);
});
