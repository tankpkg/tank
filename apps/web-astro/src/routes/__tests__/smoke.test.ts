import { describe, expect, it } from 'vitest';

import { app } from '../app';

describe('Hono API scaffold', () => {
  it('GET /api/health returns ok', async () => {
    const res = await app.request('/api/health');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(body.timestamp).toBeDefined();
  });

  it('GET /api/v1 returns scaffold status', async () => {
    const res = await app.request('/api/v1');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.version).toBe('v1');
    expect(body.status).toBe('scaffold');
  });

  it('GET /api/admin returns scaffold status', async () => {
    const res = await app.request('/api/admin');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.admin).toBe(true);
  });

  it('GET /api/auth returns 501 placeholder', async () => {
    const res = await app.request('/api/auth/session');
    expect(res.status).toBe(501);
  });
});
