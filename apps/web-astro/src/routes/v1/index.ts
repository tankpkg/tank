import { Hono } from 'hono';

// Placeholder — v1 routes will be ported in Phase 1
export const v1Routes = new Hono();

v1Routes.get('/', (c) => {
  return c.json({ version: 'v1', status: 'scaffold' });
});
