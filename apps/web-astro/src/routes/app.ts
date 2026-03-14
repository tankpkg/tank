import { Hono } from 'hono';
import { cors } from 'hono/cors';

import { adminRoutes } from './admin/index';
import { authRoutes } from './auth';
import { healthRoute } from './health';
import { v1Routes } from './v1/index';

const app = new Hono().basePath('/api');

app.use('*', cors());

app.route('/auth', authRoutes);
app.route('/health', healthRoute);
app.route('/v1', v1Routes);
app.route('/admin', adminRoutes);

export type AppType = typeof app;
export { app };
