import { Hono } from 'hono';

export const adminRoutes = new Hono();

adminRoutes.get('/', (context) => {
  return context.json({
    admin: true,
    status: 'scaffold'
  });
});
