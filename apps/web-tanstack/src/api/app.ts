import { Hono } from 'hono';
import { cors } from 'hono/cors';

import { auth } from '~/lib/auth';

import { requireAdmin } from './middleware/require-admin';
import { adminRoutes } from './routes/admin';
import { healthRoute } from './routes/health';
import { v1Routes } from './routes/v1';

const app = new Hono();

app.use(
  '*',
  cors({
    origin: (origin) => origin,
    credentials: true
  })
);

app.on(['GET', 'POST', 'PUT', 'DELETE', 'PATCH'], '/auth/**', (c) => auth.handler(c.req.raw));
app.route('/health', healthRoute);
app.route('/v1', v1Routes);
app.use('/admin/*', requireAdmin());
app.route('/admin', adminRoutes);

export type AppType = typeof app;
export { app };
