/** Verify public pages through the built registry server, not Vite's development server. */
import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

import { expect, it } from 'vitest';

async function unusedPort(): Promise<number> {
  const server = net.createServer();
  await new Promise<void>((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Could not allocate a local port');
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  return address.port;
}

it.skipIf(process.env.E2E_PRODUCTION_RENDER !== '1')(
  'renders public and login pages using the production build',
  async () => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error('DATABASE_URL is required');
    const database = new URL(databaseUrl);
    if (
      !['postgres:', 'postgresql:'].includes(database.protocol) ||
      !['localhost', '127.0.0.1', '::1', '[::1]'].includes(database.hostname) ||
      !database.pathname.endsWith('_test') ||
      database.searchParams.has('host') ||
      database.searchParams.has('hostaddr')
    ) {
      throw new Error('Production render test requires a local, explicitly named test database');
    }

    const port = await unusedPort();
    const base = `http://127.0.0.1:${port}`;
    const registryDir = path.resolve(__dirname, '../../../apps/registry');
    const server = spawn(process.execPath, ['.output/server/index.mjs'], {
      cwd: registryDir,
      env: {
        PATH: process.env.PATH,
        NODE_ENV: 'production',
        TANK_MODE: 'cloud',
        DATABASE_URL: databaseUrl,
        REDIS_URL: '',
        LOKI_URL: 'http://127.0.0.1:0',
        APP_URL: base,
        BETTER_AUTH_URL: base,
        BETTER_AUTH_SECRET: 'local-production-render-test-secret-12345',
        SUPABASE_URL: 'https://fake.supabase.co',
        HOST: '127.0.0.1',
        PORT: String(port)
      }
    });
    const exited = new Promise<void>((resolve) => server.once('close', () => resolve()));
    let output = '';
    server.stderr.on('data', (chunk: Buffer) => {
      output += chunk.toString();
    });

    try {
      server.stdout.on('data', (chunk: Buffer) => {
        output += chunk.toString();
      });
      const deadline = Date.now() + 20_000;
      let ready = false;
      while (!ready && Date.now() < deadline && server.exitCode === null) {
        ready = await new Promise<boolean>((resolve) => {
          const socket = net.connect(port, '127.0.0.1');
          socket.once('connect', () => {
            socket.destroy();
            resolve(true);
          });
          socket.once('error', () => resolve(false));
        });
        if (!ready) await delay(100);
      }
      if (!ready) throw new Error(`Registry did not start: ${output}`);

      for (const [route, content] of [
        ['/', 'The Package Manager'],
        [
          '/skills?q=&page=1&sort=updated&visibility=all&freshness=all&popularity=all&securityVerdict=all&hasReadme=false',
          'Browse Packages'
        ],
        ['/docs/overview', 'Tank Documentation'],
        ['/login?redirect=', 'Sign In | Tank']
      ]) {
        const response = await fetch(`${base}${route}`, { redirect: 'error' });
        expect(response.status, route).toBe(200);
        expect(response.headers.get('content-type'), route).toContain('text/html');
        expect(await response.text(), route).toContain(content);
      }
      const login = await fetch(`${base}/cli-login?session=00000000-0000-4000-8000-000000000000`, {
        redirect: 'manual'
      });
      expect(login.status).toBe(307);
      expect(login.headers.get('location')).toContain('/login?redirect=');
    } finally {
      if (server.exitCode === null && server.signalCode === null) server.kill('SIGTERM');
      const timeout = setTimeout(() => server.kill('SIGKILL'), 2_000);
      try {
        await exited;
      } finally {
        clearTimeout(timeout);
      }
    }
  },
  60_000
);
