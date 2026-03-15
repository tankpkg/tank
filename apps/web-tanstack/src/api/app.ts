import { Hono } from 'hono';
import { cors } from 'hono/cors';

import { auth } from '~/lib/auth';

import { requireAdmin } from './middleware/require-admin';
import { adminRoutes } from './routes/admin';
import { healthRoute } from './routes/health';
import { seoRoutes } from './routes/seo';
import { v1Routes } from './routes/v1';

const app = new Hono().basePath('/api');

app.use(
  '*',
  cors({
    origin: (origin) => origin,
    credentials: true
  })
);

app.all('/auth/*', (c) => auth.handler(c.req.raw));
app.route('/health', healthRoute);
app.route('/', seoRoutes);
app.route('/v1', v1Routes);
app.use('/admin/*', requireAdmin());
app.route('/admin', adminRoutes);

app.notFound((c) => c.json({ error: 'Not found', path: c.req.path }, 404));

export type AppType = typeof app;
export { app };
