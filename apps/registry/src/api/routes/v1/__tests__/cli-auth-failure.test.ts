// @vitest-environment node
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';

import { expect, it } from 'vitest';

it('distinguishes invalid requests from a real session-store outage', async () => {
  const source = `
    import { OpenAPIHono } from '@hono/zod-openapi';
    import { cliAuthRoutes } from './src/api/routes/v1/cli-auth.ts';
    const app = new OpenAPIHono();
    app.route('/cli-auth', cliAuthRoutes);
    const server = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: app.fetch });
    console.log('TEST_PORT=' + server.port);
  `;
  const child = spawn('bun', ['-e', source], {
    env: {
      ...process.env,
      APP_URL: 'http://127.0.0.1:5555',
      DATABASE_URL: 'postgresql://tank:tank@127.0.0.1:1/tank_test',
      REDIS_URL: '',
      BETTER_AUTH_SECRET: 'local-test-only-not-a-production-secret'
    }
  });
  const exit = new Promise<void>((resolve) => child.once('close', () => resolve()));
  try {
    const port = await new Promise<string>((resolve, reject) => {
      let output = '';
      const timeout = setTimeout(() => reject(new Error(`Test registry did not start: ${output}`)), 20_000);
      child.stdout.on('data', (chunk: Buffer) => {
        output += chunk.toString();
        const match = output.match(/TEST_PORT=(\d+)/);
        if (match) {
          clearTimeout(timeout);
          resolve(match[1]);
        }
      });
      child.once('error', reject);
      child.once('close', () => {
        clearTimeout(timeout);
        reject(new Error(`Test registry exited before startup: ${output}`));
      });
    });
    const request = (body: unknown) =>
      fetch(`http://127.0.0.1:${port}/cli-auth/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

    expect((await request({})).status).toBe(400);
    const response = await request({ state: randomUUID() });
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toMatch(/unable to start/i);
    expect(JSON.stringify(body)).not.toMatch(/ECONNREFUSED|postgres|127\.0\.0\.1/i);
  } finally {
    child.kill('SIGTERM');
    await exit;
  }
}, 30_000);
