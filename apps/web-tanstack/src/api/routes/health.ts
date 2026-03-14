import { Hono } from 'hono';

export const healthRoute = new Hono();

healthRoute.get('/', (context) => {
  return context.json({
    status: 'ok',
    timestamp: new Date().toISOString()
  });
});
