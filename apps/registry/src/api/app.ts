import { Hono } from 'hono';
import { cors } from 'hono/cors';

import { auth } from '~/lib/auth/core';
import { requireAdmin } from './middleware/require-admin';
import { ogRoutes } from './routes/og';
import { v1Routes } from './routes/v1';

export const app = new Hono()
  .basePath('/api')
  .use('*', cors({ origin: (origin) => origin, credentials: true }))
  .all('/auth/*', (c) => auth.handler(c.req.raw))
  .get('/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }))
  .route('/og', ogRoutes)
  .route('/v1', v1Routes)
  .use('/admin/*', requireAdmin())
  .get('/admin', (c) => c.json({ admin: true, status: 'scaffold' }))
  .notFound((c) => c.json({ error: 'Not found', path: c.req.path }, 404));

export type AppType = typeof app;
