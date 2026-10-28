/** Verify public pages through the built registry server, not Vite's development server. */
import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

import postgres from 'postgres';
import { expect, it } from 'vitest';

import {
  assertOwnedTestDatabaseAlive,
  type OwnedTestDatabase,
  runTestDocker,
  validateTestDatabaseUrl,
  verifyTestDatabase
} from '../../../e2e/helpers/isolated-test-database.js';
import {
  closeOwnedDatabase,
  createReadyDatabase,
  replaceEnvironment,
  runtimeArgs,
  verifyPrivateEnvironment,
  withPrivateEnvironment
} from '../../../e2e/helpers/owned-ui-fixture-harness.js';

const enabled = process.env.E2E_PRODUCTION_RENDER === '1';
const renderRequestDeadlineMs = 25_000;

async function fetchRenderPage(
  url: string,
  options: { redirect: RequestRedirect; signal: AbortSignal; onHeaders?: () => void }
) {
  const response = await fetch(url, { redirect: options.redirect, signal: options.signal });
  options.onHeaders?.();
  const body = await response.text();
  return { response, body };
}

async function unusedPort(): Promise<number> {
  const server = net.createServer();
  await new Promise<void>((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Could not allocate a local port');
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  return address.port;
}

interface RenderFixtureOptions {
  requestOrigin?: string;
  requestDeadlineMs?: number;
  onStarted?: (database: OwnedTestDatabase, registry: ChildProcessWithoutNullStreams) => void;
  onHeaders?: () => void;
}

async function verifyRendering(options: RenderFixtureOptions = {}): Promise<void> {
  await withPrivateEnvironment(async (sandbox) => {
    await verifyPrivateEnvironment(sandbox);
    const database = await createReadyDatabase(true);
    try {
      await assertOwnedTestDatabaseAlive(database);
      const port = await unusedPort();
      const base = `http://127.0.0.1:${port}`;
      const registryDir = path.resolve(__dirname, '../../../apps/registry');
      const server = spawn(process.execPath, runtimeArgs(['.output/server/index.mjs']), {
        cwd: registryDir,
        env: {
          PATH: process.env.PATH,
          DOTENV_CONFIG_PATH: '/dev/null',
          NODE_ENV: 'production',
          TANK_MODE: 'cloud',
          DATABASE_URL: database.url,
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
      let spawnError: Error | undefined;
      server.once('error', (error) => {
        spawnError = error;
        output += error.message;
      });
      server.stderr.on('data', (chunk: Buffer) => {
        output += chunk.toString();
      });

      try {
        server.stdout.on('data', (chunk: Buffer) => {
          output += chunk.toString();
        });
        const deadline = Date.now() + 20_000;
        let ready = false;
        while (!ready && !spawnError && Date.now() < deadline && server.exitCode === null) {
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
        options.onStarted?.(database, server);

        // This deadline covers both headers and body reads, leaving cleanup its own time.
        const signal = AbortSignal.timeout(options.requestDeadlineMs ?? renderRequestDeadlineMs);
        const requestOrigin = options.requestOrigin ?? base;
        for (const [route, content] of [
          ['/', 'The Package Manager'],
          [
            '/skills?q=&page=1&sort=updated&visibility=all&freshness=all&popularity=all&securityVerdict=all&hasReadme=false',
            'Browse Packages'
          ],
          ['/docs/overview', 'Tank Documentation'],
          ['/login?redirect=', 'Sign In | Tank']
        ]) {
          const { response, body } = await fetchRenderPage(`${requestOrigin}${route}`, {
            redirect: 'error',
            signal,
            onHeaders: options.onHeaders
          });
          expect(response.status, route).toBe(200);
          expect(response.headers.get('content-type'), route).toContain('text/html');
          expect(body, route).toContain(content);
        }
        const { response: login } = await fetchRenderPage(
          `${requestOrigin}/cli-login?session=00000000-0000-4000-8000-000000000000`,
          { redirect: 'manual', signal }
        );
        expect(login.status).toBe(307);
        expect(login.headers.get('location')).toContain('/login?redirect=');
      } finally {
        if (server.exitCode === null && server.signalCode === null) server.kill('SIGTERM');
        const killTimeout = setTimeout(() => server.kill('SIGKILL'), 2_000);
        let cleanupTimeout: ReturnType<typeof setTimeout> | undefined;
        try {
          await Promise.race([
            exited,
            new Promise<never>((_resolve, reject) => {
              cleanupTimeout = setTimeout(() => reject(new Error('Registry process did not exit')), 10_000);
            })
          ]);
        } finally {
          clearTimeout(killTimeout);
          if (cleanupTimeout) clearTimeout(cleanupTimeout);
        }
      }
    } finally {
      await closeOwnedDatabase(database);
    }
  });
}

async function verifyRenderingUnderHostileProxy(): Promise<void> {
  await withPrivateEnvironment(async () => {
    const first = await createReadyDatabase();
    let second: OwnedTestDatabase | undefined;
    let proxy: net.Server | undefined;
    let operationError: unknown;
    let operationFailed = false;
    try {
      second = await createReadyDatabase(false, first);
      let targetPort = Number(new URL(first.url).port);
      let connections = 0;
      const server = net.createServer((client) => {
        connections++;
        const upstream = net.connect(targetPort, '127.0.0.1');
        client.on('error', () => upstream.destroy());
        upstream.on('error', () => client.destroy());
        client.pipe(upstream).pipe(client);
      });
      proxy = server;
      await new Promise<void>((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve));
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Proxy did not bind locally');
      const proxyUrl = new URL(first.url);
      proxyUrl.port = String(address.port);
      const inspectProxy = async (): Promise<string> => {
        const sql = postgres(proxyUrl.toString(), { max: 1, connect_timeout: 3 });
        try {
          await verifyTestDatabase(sql, validateTestDatabaseUrl(proxyUrl.toString()));
          const rows = await sql<{ id: string }[]>`SELECT system_identifier::text AS id FROM pg_control_system()`;
          return rows[0].id;
        } finally {
          await sql.end({ timeout: 3 });
        }
      };
      const firstId = await inspectProxy();
      targetPort = Number(new URL(second.url).port);
      expect(await inspectProxy()).not.toBe(firstId);
      const baselineConnections = connections;
      const cleanEnvironment = { ...process.env };
      try {
        Object.assign(process.env, {
          DATABASE_URL: proxyUrl.toString(),
          PGHOST: 'remote.invalid',
          PGPORT: '1',
          PGDATABASE: 'production',
          PGPASSWORD: 'hostile-test-password',
          PGOPTIONS: '-c statement_timeout=1',
          PGTARGETSESSIONATTRS: 'hostile-invalid-value',
          NODE_OPTIONS: '--require=/nonexistent-hostile-test-module',
          UNRELATED_TEST_SECRET: 'hostile-test-secret',
          AWS_SECRET_ACCESS_KEY: 'hostile-test-secret'
        });
        await verifyRendering();
        expect(connections).toBe(baselineConnections);
      } finally {
        replaceEnvironment(cleanEnvironment);
      }
    } catch (error) {
      operationFailed = true;
      operationError = error;
    }
    const cleanup = await Promise.allSettled([
      proxy?.listening
        ? new Promise<void>((resolve, reject) => proxy?.close((error) => (error ? reject(error) : resolve())))
        : Promise.resolve(),
      second ? closeOwnedDatabase(second) : Promise.resolve(),
      closeOwnedDatabase(first)
    ]);
    const errors = cleanup.filter((result) => result.status === 'rejected').map((result) => result.reason);
    if (errors.length)
      throw new AggregateError(operationFailed ? [operationError, ...errors] : errors, 'Proxy cleanup failed');
    if (operationFailed) throw operationError;
  });
}

it.each(['headers', 'body'] as const)('aborts stalled render response %s', async (phase) => {
  const sockets = new Set<net.Socket>();
  let onRequest = () => {};
  let onHeaders = () => {};
  const requestReceived = new Promise<void>((resolve) => {
    onRequest = resolve;
  });
  const headersReceived = new Promise<void>((resolve) => {
    onHeaders = resolve;
  });
  const server = http.createServer((_request, response) => {
    if (phase === 'body') {
      response.writeHead(200, { 'content-type': 'text/html' });
      response.write('<html><body>partial response');
    }
    onRequest();
  });
  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
  });
  await new Promise<void>((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Could not bind stalled response fixture');
  const controller = new AbortController();
  const pending = fetchRenderPage(`http://127.0.0.1:${address.port}/`, {
    redirect: 'error',
    signal: controller.signal,
    onHeaders
  }).then(
    () => ({ error: undefined }),
    (error: unknown) => ({ error })
  );
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      phase === 'body' ? headersReceived : requestReceived,
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new Error('Stalled response fixture did not receive the request')), 10_000);
      })
    ]);
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => controller.abort(), 100);
    const result = await pending;
    expect(controller.signal.aborted).toBe(true);
    expect(result.error).toBeInstanceOf(Error);
    expect((result.error as Error).name).toBe('AbortError');
  } finally {
    if (timeout) clearTimeout(timeout);
    controller.abort();
    for (const socket of sockets) socket.destroy();
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
}, 15_000);

async function verifyStalledRenderingCleanup(): Promise<void> {
  await withPrivateEnvironment(async () => {
    const sockets = new Set<net.Socket>();
    let sentPartialBody = false;
    let receivedHeaders = false;
    const stall = http.createServer((_request, response) => {
      response.writeHead(200, { 'content-type': 'text/html' });
      response.write('<html><body>partial response');
      sentPartialBody = true;
    });
    stall.on('connection', (socket) => {
      sockets.add(socket);
      socket.once('close', () => sockets.delete(socket));
    });
    await new Promise<void>((resolve, reject) => stall.once('error', reject).listen(0, '127.0.0.1', resolve));
    const address = stall.address();
    if (!address || typeof address === 'string') throw new Error('Could not bind stalled response fixture');
    let database: OwnedTestDatabase | undefined;
    let registry: ChildProcessWithoutNullStreams | undefined;
    try {
      const failure = await verifyRendering({
        requestOrigin: `http://127.0.0.1:${address.port}`,
        requestDeadlineMs: 5_000,
        onStarted: (startedDatabase, startedRegistry) => {
          database = startedDatabase;
          registry = startedRegistry;
        },
        onHeaders: () => {
          receivedHeaders = true;
        }
      }).then(
        () => undefined,
        (error: unknown) => error
      );
      expect(sentPartialBody).toBe(true);
      expect(receivedHeaders).toBe(true);
      expect(failure).toBeInstanceOf(Error);
      expect(['AbortError', 'TimeoutError']).toContain((failure as Error).name);
      expect(registry && (registry.exitCode !== null || registry.signalCode !== null)).toBe(true);
      if (!database) throw new Error('The owned database did not start');
      await expect(runTestDocker(['inspect', database.containerId])).rejects.toThrow(/No such (object|container)/i);
    } finally {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve, reject) => stall.close((error) => (error ? reject(error) : resolve())));
    }
  });
}

it.skipIf(!enabled)(
  'cleans up the registry and owned database after a stalled HTML body times out',
  verifyStalledRenderingCleanup,
  300_000
);

async function verifyUnrelatedContainerSurvives(): Promise<void> {
  await withPrivateEnvironment(async () => {
    const unrelated = await createReadyDatabase();
    try {
      const inspected = await runTestDocker([
        'inspect',
        '--format',
        '{{.Name}} {{index .Config.Labels "tank.auth.owner"}}',
        unrelated.containerId
      ]);
      const [name, owner] = inspected.split(' ');
      expect(name).toMatch(/^\/tank-auth-pg-[a-f0-9]+$/);
      expect(owner).toMatch(/^[a-f0-9]+$/);
      const failure = Object.assign(
        new Error(`docker create --name ${name.slice(1)} --label tank.auth.owner=${owner} ${unrelated.containerId}`),
        { code: '57P03' }
      );
      let attempts = 0;
      await expect(
        createReadyDatabase(false, undefined, async () => {
          attempts++;
          throw failure;
        })
      ).rejects.toBe(failure);
      expect(attempts).toBe(3);
      await assertOwnedTestDatabaseAlive(unrelated);
      const sql = postgres(unrelated.url, { max: 1, connect_timeout: 3 });
      try {
        const rows = await sql<{ value: number }[]>`SELECT 1 AS value`;
        expect(rows[0]?.value).toBe(1);
      } finally {
        await sql.end({ timeout: 3 });
      }
    } finally {
      await closeOwnedDatabase(unrelated);
    }
  });
}

it.skipIf(!enabled)(
  'never stops another owned container named in a creation error',
  verifyUnrelatedContainerSurvives,
  180_000
);

it.skipIf(!enabled)('isolates schema launchers from hostile environment and dotenv', async () => {
  const original = { ...process.env };
  try {
    Object.assign(process.env, {
      PGHOST: 'remote.invalid',
      PGPASSWORD: 'hostile-test-password',
      NODE_OPTIONS: '--require=/dev/null/hostile-test-module',
      UNRELATED_TEST_SECRET: 'hostile-test-secret'
    });
    await withPrivateEnvironment(verifyPrivateEnvironment);
    let sandbox = '';
    await expect(
      withPrivateEnvironment(async (directory) => {
        sandbox = directory;
        throw new Error('intentional sandbox failure');
      })
    ).rejects.toThrow('intentional sandbox failure');
    expect(fs.existsSync(sandbox)).toBe(false);
    expect(process.env.PGPASSWORD).toBe('hostile-test-password');
  } finally {
    replaceEnvironment(original);
  }
});

it.skipIf(!enabled)(
  'renders public and login pages using the production build',
  verifyRenderingUnderHostileProxy,
  600_000
);
