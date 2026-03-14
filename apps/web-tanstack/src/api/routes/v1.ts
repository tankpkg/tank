import { Hono } from 'hono';

export const v1Routes = new Hono();

v1Routes.get('/', (context) => {
  return context.json({
    version: 'v1',
    status: 'scaffold'
  });
});
