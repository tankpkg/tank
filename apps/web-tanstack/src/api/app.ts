import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { requireAdmin } from '~/api/middleware/require-admin';
import { ogRoutes } from '~/api/routes/og';
import { seoRoutes } from '~/api/routes/seo';
import { v1Routes } from '~/api/routes/v1';
import { auth } from '~/lib/auth/core';

const app = new Hono().basePath('/api');

app.use(
  '*',
  cors({
    origin: (origin) => origin,
    credentials: true
  })
);

app.all('/auth/*', (c) => auth.handler(c.req.raw));

app.get('/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }));

app.route('/', seoRoutes);
app.route('/og', ogRoutes);
app.route('/v1', v1Routes);

app.use('/admin/*', requireAdmin());
app.get('/admin', (c) => c.json({ admin: true, status: 'scaffold' }));

app.notFound((c) => c.json({ error: 'Not found', path: c.req.path }, 404));

export type AppType = typeof app;
export { app };
