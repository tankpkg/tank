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

function normalizeBackend(raw: string): string {
  return ['minio', 's3-compatible'].includes(raw) ? 's3' : raw;
}

const storageReady = (async () => {
  try {
    const { getSystemConfig, decryptSecret } = await import('~/lib/setup');
    const config = await getSystemConfig();
    if (config?.instanceUrl) {
      process.env.APP_URL = config.instanceUrl;
      process.env.BETTER_AUTH_URL = config.instanceUrl;
    }
    if (!config?.storageBackend) return;

    const { setStorageOverride } = await import('~/services/storage/provider');
    setStorageOverride({
      backend: normalizeBackend(config.storageBackend),
      bucket: config.storageBucket ?? undefined,
      endpoint: config.storageEndpoint ?? undefined,
      region: config.storageRegion ?? undefined,
      accessKey: config.storageAccessKey ?? undefined,
      secretKey: config.storageSecretKeyEnc ? decryptSecret(config.storageSecretKeyEnc) : undefined,
      supabaseUrl: config.supabaseUrl ?? undefined,
      supabaseServiceKey: config.supabaseServiceKeyEnc ? decryptSecret(config.supabaseServiceKeyEnc) : undefined
    });
    if (config.storagePublicEndpoint) {
      process.env.S3_PUBLIC_ENDPOINT = config.storagePublicEndpoint;
    }
  } catch {
    // DB may not be initialized yet (first boot before wizard)
  }
})();

export const app = new Hono()
  .basePath('/api')
  .use('*', cors({ origin: (origin) => origin, credentials: true }))
  .use('/auth/*', async (_c, next) => {
    await storageReady;
    return next();
  })
  .all('/auth/*', (c) => auth.handler(c.req.raw))
  .get('/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }))
  .use('/setup/*', async (c, next) => {
    if (process.env.TANK_MODE !== 'selfhosted') {
      return c.json({ error: 'Not found' }, 404);
    }
    return next();
  })
  .route('/setup', setupRoutes)
  .use('/storage/*', async (_c, next) => {
    await storageReady;
    return next();
  })
  .route('/storage', storageRoutes)
  .route('/og', ogRoutes)
  .route('/cli', cliRoutes)
  .use('/v1/*', async (_c, next) => {
    await storageReady;
    return next();
  })
  .route('/v1', v1Routes)
  .use('/admin/*', async (_c, next) => {
    await storageReady;
    return next();
  })
  .use('/admin/*', requireAdmin())
  .route('/admin', adminRoutes)
  .notFound((c) => c.json({ error: 'Not found', path: c.req.path }, 404));

export type AppType = typeof app;
