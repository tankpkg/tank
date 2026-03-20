import { Hono } from 'hono';
import { cors } from 'hono/cors';

import { auth } from '~/lib/auth/core';
import { requireAdmin } from './middleware/require-admin';
import { adminRoutes } from './routes/admin';
import { cliRoutes } from './routes/cli';
import { ogRoutes } from './routes/og';
import { setupRoutes } from './routes/setup';
import { storageRoutes } from './routes/storage';
import { v1Routes } from './routes/v1';

export const app = new Hono()
  .basePath('/api')
  .use('*', cors({ origin: (origin) => origin, credentials: true }))
  .all('/auth/*', (c) => auth.handler(c.req.raw))
  .get('/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }))
  .use('/setup/*', async (c, next) => {
    if (process.env.TANK_MODE !== 'selfhosted') {
      return c.json({ error: 'Not found' }, 404);
    }
    return next();
  })
  .route('/setup', setupRoutes)
  .route('/storage', storageRoutes)
  .route('/og', ogRoutes)
  .route('/cli', cliRoutes)
  .route('/v1', v1Routes)
  .use('/admin/*', requireAdmin())
  .route('/admin', adminRoutes)
  .notFound((c) => c.json({ error: 'Not found', path: c.req.path }, 404));

export type AppType = typeof app;
