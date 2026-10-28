/** Real CLI, registry, browser authorization and PostgreSQL; see login intent C6, C7, C11 and C_browser_4. */
import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

import Redis from 'ioredis';
import postgres from 'postgres';
import { expect, it } from 'vitest';

import { createOwnedTestRedis, type OwnedTestRedis } from '../fixtures/auth-isolation.js';
import {
  acquireOwnedBeforeDeadline,
  createOwnedRedisTransitionFault,
  type OwnedRedisTransitionFault
} from '../helpers/cli-auth-outage-test-support.js';
import {
  assertOwnedTestDatabaseAlive,
  createOwnedTestDatabase,
  isolatedBunArguments,
  type OwnedTestDatabase,
  runTestDocker,
  validateTestDatabaseUrl,
  verifyTestDatabase
} from '../helpers/isolated-test-database.js';
import { createOwnedPostgresTls } from '../helpers/owned-postgres-tls.js';
import {
  closeOwnedDatabase,
  replaceEnvironment,
  runtimeArgs,
  verifyPrivateEnvironment,
  withPrivateEnvironment
} from '../helpers/owned-ui-fixture-harness.js';

const enabled = process.env.E2E_FULL_LOGIN === '1';
const setupDeadlineMs = 120_000;

async function stopProcess(child: ChildProcessWithoutNullStreams, exited: Promise<unknown>): Promise<void> {
  if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
  const killTimeout = setTimeout(() => child.kill('SIGKILL'), 2_000);
  let deadline: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      exited,
      new Promise<never>((_resolve, reject) => {
        deadline = setTimeout(() => reject(new Error('Test process did not exit')), 10_000);
      })
    ]);
  } finally {
    clearTimeout(killTimeout);
    if (deadline) clearTimeout(deadline);
  }
}

async function withinDeadline<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  let onAbort = () => {};
  const aborted = new Promise<never>((_resolve, reject) => {
    onAbort = () => reject(new Error('Full login test exceeded its deadline'));
    if (signal.aborted) onAbort();
    else signal.addEventListener('abort', onAbort, { once: true });
  });
  try {
    return await Promise.race([operation, aborted]);
  } finally {
    signal.removeEventListener('abort', onAbort);
  }
}

async function startRegistry(
  databaseUrl: string,
  lokiUrl: string,
  redisUrl = '',
  databaseCa?: string,
  insecureTlsDefault = false,
  tankMode: 'cloud' | 'selfhosted' = 'cloud'
) {
  const probe = net.createServer();
  await new Promise<void>((resolve, reject) => probe.once('error', reject).listen(0, '127.0.0.1', resolve));
  const address = probe.address();
  if (!address || typeof address === 'string') throw new Error('Could not allocate a local port');
  await new Promise<void>((resolve, reject) => probe.close((error) => (error ? reject(error) : resolve())));
  const base = `http://127.0.0.1:${address.port}`;
  const server = spawn(process.execPath, runtimeArgs(['.output/server/index.mjs']), {
    cwd: path.resolve(__dirname, '../../apps/registry'),
    env: {
      PATH: process.env.PATH,
      DOTENV_CONFIG_PATH: '/dev/null',
      NODE_ENV: 'production',
      TANK_MODE: tankMode,
      DATABASE_URL: databaseUrl,
      DATABASE_SSL_CA: databaseCa,
      NODE_TLS_REJECT_UNAUTHORIZED: insecureTlsDefault ? '0' : undefined,
      REDIS_URL: redisUrl,
      LOKI_URL: lokiUrl,
      APP_URL: base,
      BETTER_AUTH_URL: base,
      BETTER_AUTH_SECRET: 'local-full-login-test-secret-123456789',
      SUPABASE_URL: 'https://fake.supabase.co',
      HOST: '127.0.0.1',
      PORT: String(address.port)
    }
  });
  const exited = new Promise<void>((resolve) => server.once('close', () => resolve()));
  let output = '';
  let listening = false;
  let spawnError: Error | undefined;
  server.once('error', (error) => {
    spawnError = error;
    output += error.message;
  });
  server.stdout.on('data', (chunk: Buffer) => {
    output += chunk.toString();
    listening ||= output.includes(`Listening on: http://127.0.0.1:${address.port}/`);
  });
  server.stderr.on('data', (chunk: Buffer) => {
    output += chunk.toString();
  });

  try {
    const deadline = Date.now() + 20_000;
    while (!listening && !spawnError && Date.now() < deadline && server.exitCode === null) {
      await delay(100);
    }
    if (!listening) throw new Error(`Isolated registry did not start: ${output}`);
    return { base, server, exited };
  } catch (error) {
    await stopProcess(server, exited);
    throw error;
  }
}

async function verifyEntrypoint(
  tls: Awaited<ReturnType<typeof createOwnedPostgresTls>>,
  sandbox: string,
  shouldStart: boolean
): Promise<void> {
  const probe = net.createServer();
  await new Promise<void>((resolve, reject) => probe.once('error', reject).listen(0, '127.0.0.1', resolve));
  const address = probe.address();
  if (!address || typeof address === 'string') throw new Error('Could not allocate a local port');
  await new Promise<void>((resolve, reject) => probe.close((error) => (error ? reject(error) : resolve())));
  const base = `http://127.0.0.1:${address.port}`;
  const child = spawn('sh', ['scripts/entrypoint.sh'], {
    cwd: path.resolve(__dirname, '../../apps/registry'),
    env: {
      PATH: process.env.PATH,
      HOME: sandbox,
      TMPDIR: sandbox,
      DOTENV_CONFIG_PATH: '/dev/null',
      BUN_CONFIG_NO_DOTENV: '1',
      NODE_ENV: 'production',
      NODE_TLS_REJECT_UNAUTHORIZED: '0',
      DATABASE_URL: tls.url,
      DATABASE_SSL_CA: tls.certificate,
      BETTER_AUTH_SECRET: 'local-startup-test-secret-123456789',
      SUPABASE_URL: 'https://fake.supabase.co',
      APP_URL: base,
      BETTER_AUTH_URL: base,
      AUTO_MIGRATE: 'false',
      HOST: '127.0.0.1',
      PORT: String(address.port)
    }
  });
  let output = '';
  const ready = new Promise<void>((resolve) => {
    child.stdout.on('data', (chunk: Buffer) => {
      output += chunk.toString();
      if (output.includes(`Listening on: ${base}/`)) resolve();
    });
  });
  child.stderr.resume();
  const exited = new Promise<number | null>((resolve, reject) => {
    child.once('error', reject);
    child.once('close', resolve);
  });
  try {
    if (shouldStart) {
      await withinDeadline(
        Promise.race([ready, exited.then((code) => Promise.reject(new Error(`Entrypoint exited early: ${code}`)))]),
        AbortSignal.timeout(20_000)
      );
      const response = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(5_000) });
      expect(response.status).toBe(200);
    } else {
      const code = await withinDeadline(exited, AbortSignal.timeout(20_000));
      if (code === null) throw new Error('Entrypoint exited on a signal');
      expect(code).toBeGreaterThan(0);
    }
  } finally {
    await stopProcess(
      child,
      exited.catch(() => undefined)
    );
  }
}

async function startSourceRegistry(databaseUrl: string, redisUrl: string) {
  const source = `
    import { OpenAPIHono } from '@hono/zod-openapi';
    import { cliAuthRoutes } from './src/api/routes/v1/cli-auth.ts';
    import { auth } from './src/lib/auth/core.ts';
    const app = new OpenAPIHono();
    app.on(['GET', 'POST'], '/api/auth/*', (c) => auth.handler(c.req.raw));
    app.route('/api/v1/cli-auth', cliAuthRoutes);
    const server = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: app.fetch });
    const base = 'http://127.0.0.1:' + server.port;
    process.env.APP_URL = base;
    process.env.BETTER_AUTH_URL = base;
    console.log('SOURCE_AUTH_SERVER=' + base);
  `;
  const server = spawn('bun', isolatedBunArguments(['-e', source]), {
    cwd: path.resolve(__dirname, '../../apps/registry'),
    env: {
      PATH: process.env.PATH,
      DOTENV_CONFIG_PATH: '/dev/null',
      NODE_ENV: 'production',
      TANK_MODE: 'cloud',
      DATABASE_URL: databaseUrl,
      REDIS_URL: redisUrl,
      LOKI_URL: 'http://127.0.0.1:0',
      APP_URL: 'http://127.0.0.1:0',
      BETTER_AUTH_URL: 'http://127.0.0.1:0',
      BETTER_AUTH_SECRET: 'local-full-login-test-secret-123456789',
      SUPABASE_URL: 'https://fake.supabase.co'
    }
  });
  const exited = new Promise<void>((resolve) => server.once('close', () => resolve()));
  let output = '';
  server.stderr.on('data', (chunk: Buffer) => {
    output += chunk.toString();
  });
  try {
    const base = await new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(`Source registry did not start: ${output}`)), 20_000);
      server.stdout.on('data', (chunk: Buffer) => {
        output += chunk.toString();
        const match = /SOURCE_AUTH_SERVER=(http:\/\/127\.0\.0\.1:\d+)/.exec(output);
        if (match) {
          clearTimeout(timeout);
          resolve(match[1]);
        }
      });
      server.once('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
      server.once('close', () => {
        clearTimeout(timeout);
        reject(new Error(`Source registry exited before startup: ${output}`));
      });
    });
    return { base, server, exited };
  } catch (error) {
    await stopProcess(server, exited);
    throw error;
  }
}

async function startLogSink() {
  let captureUrl: (url: string) => void = () => {};
  const authUrl = new Promise<string>((resolve) => {
    captureUrl = resolve;
  });
  const server = http.createServer((request, response) => {
    let body = '';
    request.on('data', (chunk: Buffer) => {
      body += chunk.toString();
    });
    request.on('end', () => {
      try {
        const payload = JSON.parse(body) as {
          streams: Array<{ stream: { app?: string }; values: Array<[string, string]> }>;
        };
        for (const stream of payload.streams) {
          if (stream.stream.app !== 'tank-cli') continue;
          for (const [, line] of stream.values) {
            const entry = JSON.parse(line) as { authUrl?: unknown };
            if (typeof entry.authUrl === 'string') captureUrl(entry.authUrl);
          }
        }
        response.writeHead(204).end();
      } catch {
        response.writeHead(400).end();
      }
    });
  });
  await new Promise<void>((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Could not allocate a local log sink');
  return { server, authUrl, base: `http://127.0.0.1:${address.port}` };
}

async function stopLogSink(server: http.Server): Promise<void> {
  let deadline: ReturnType<typeof setTimeout> | undefined;
  try {
    await new Promise<void>((resolve, reject) => {
      deadline = setTimeout(() => reject(new Error('Test log sink did not close')), 5_000);
      server.close((error) => (error ? reject(error) : resolve()));
      server.closeAllConnections();
    });
  } finally {
    if (deadline) clearTimeout(deadline);
  }
}

async function authorizeInBrowser(
  input: { authUrl: string; registry: string; cookie: string; browserPath: string; home: string },
  deadline: AbortSignal
): Promise<void> {
  const browser = spawn(process.execPath, runtimeArgs([path.resolve(__dirname, '../helpers/cli-login-browser.mjs')]), {
    env: {
      HOME: input.home,
      TMPDIR: input.home,
      PATH: process.env.PATH,
      NO_COLOR: '1',
      DOTENV_CONFIG_PATH: '/dev/null'
    }
  });
  let output = '';
  browser.stdout.on('data', (chunk: Buffer) => {
    output += chunk.toString();
  });
  browser.stderr.on('data', (chunk: Buffer) => {
    output += chunk.toString();
  });
  browser.stdin.on('error', (error) => {
    output += error.message;
  });
  const exited = new Promise<number | null>((resolve, reject) => {
    browser.once('error', reject);
    browser.once('close', resolve);
  });
  browser.stdin.end(JSON.stringify({ ...input, profileDir: path.join(input.home, 'browser-profile') }));
  try {
    const code = await withinDeadline(exited, deadline);
    if (code !== 0 || !output.includes('Browser authorized the CLI session')) {
      throw new Error(`Browser authorization failed (${code}): ${output}`);
    }
  } finally {
    await stopProcess(browser, exited);
  }
}

async function verifyFullLogin(usePostgresTls = false): Promise<void> {
  const browserPath = process.env.TANK_TEST_BROWSER_PATH;
  if (!browserPath) throw new Error('TANK_TEST_BROWSER_PATH must point to a dedicated Chrome Headless Shell');
  await withPrivateEnvironment(async (sandbox) => {
    await verifyPrivateEnvironment(sandbox);
    const database = await acquireOwnedBeforeDeadline(
      () => createOwnedTestDatabase(true),
      closeOwnedDatabase,
      AbortSignal.timeout(setupDeadlineMs)
    );
    const email = `cli-login-${randomUUID()}@example.test`;
    const deadline = AbortSignal.timeout(75_000);
    let sql: postgres.Sql | undefined;
    let child: ChildProcessWithoutNullStreams | undefined;
    let exit: Promise<number | null> | undefined;
    let registryProcess: Awaited<ReturnType<typeof startRegistry>> | undefined;
    let postgresTls: Awaited<ReturnType<typeof createOwnedPostgresTls>> | undefined;
    let logSink: Awaited<ReturnType<typeof startLogSink>> | undefined;
    let operationError: unknown;
    let operationFailed = false;

    try {
      await assertOwnedTestDatabaseAlive(database);
      sql = postgres(database.url, { max: 1, connect_timeout: 3, connection: { statement_timeout: 3000 } });
      await verifyTestDatabase(sql, validateTestDatabaseUrl(database.url));
      const home = path.join(sandbox, 'client');
      fs.mkdirSync(home);
      const binDir = path.join(home, 'empty-bin');
      const configDir = path.join(home, '.tank');
      fs.mkdirSync(binDir);
      fs.mkdirSync(configDir);
      logSink = await startLogSink();
      if (usePostgresTls) postgresTls = await createOwnedPostgresTls(database, sandbox);
      registryProcess = await startRegistry(
        postgresTls?.url ?? database.url,
        logSink.base,
        '',
        postgresTls?.certificate
      );
      const registry = registryProcess.base;
      fs.writeFileSync(path.join(configDir, 'config.json'), JSON.stringify({ registry, telemetry: false }));
      const state = randomUUID();
      const probe = await fetch(`${registry}/api/v1/cli-auth/start`, {
        method: 'POST',
        redirect: 'error',
        signal: deadline,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state })
      });
      expect(probe.status).toBe(200);
      const probeCode = (await probe.json()).sessionCode;
      const rows = await sql`SELECT value FROM kv_store WHERE key LIKE ${`cli-auth%:${probeCode}`}`;
      expect(rows).toHaveLength(1);
      expect(JSON.parse(rows[0].value).state).toBe(state);
      const signup = await fetch(`${registry}/api/auth/sign-up/email`, {
        method: 'POST',
        redirect: 'error',
        signal: deadline,
        headers: { 'Content-Type': 'application/json', Origin: registry },
        body: JSON.stringify({ name: 'CLI Test', email, password: 'local-test-password-123' })
      });
      expect(signup.status).toBe(200);
      const cookie = signup.headers
        .getSetCookie()
        .map((value) => value.split(';')[0])
        .join('; ');
      expect(cookie).not.toBe('');

      // Capture the URL from the real CLI's logs, whether or not open() reports success.
      child = spawn(
        process.execPath,
        runtimeArgs([path.resolve(__dirname, '../../packages/cli/dist/bin/tank.js'), 'login']),
        {
          env: {
            HOME: home,
            TMPDIR: home,
            PATH: binDir,
            DOTENV_CONFIG_PATH: '/dev/null',
            DISPLAY: '',
            WAYLAND_DISPLAY: '',
            BROWSER: '/dev/null',
            NO_COLOR: '1',
            TANK_REGISTRY_URL: registry,
            TANK_NO_UPDATE_CHECK: '1',
            TANK_TELEMETRY: '0',
            TANK_TELEMETRY_HOST: registry,
            TANK_LOKI_URL: logSink.base
          }
        }
      );
      let cliError: Error | undefined;
      child.once('error', (error) => {
        cliError = error;
      });
      exit = new Promise<number | null>((resolve) => child?.once('close', resolve));
      const authUrl = await Promise.race([
        withinDeadline(logSink.authUrl, deadline),
        exit.then((code) => {
          throw new Error(`CLI exited before login URL (${code}): ${cliError?.message ?? ''}`);
        })
      ]);
      const sessionCode = new URL(authUrl).searchParams.get('session');
      if (!sessionCode) throw new Error('CLI auth URL did not include a session code');
      expect(new URL(authUrl).origin).toBe(registry);

      await authorizeInBrowser({ authUrl, registry, cookie, browserPath, home }, deadline);
      expect(await withinDeadline(exit, deadline)).toBe(0);

      const config = JSON.parse(fs.readFileSync(path.join(configDir, 'config.json'), 'utf8'));
      expect(config.user.email).toBe(email);
      expect(config.token).toMatch(/^tank_/);
      const identity = await fetch(`${registry}/api/v1/auth/whoami`, {
        redirect: 'error',
        signal: deadline,
        headers: { Authorization: `Bearer ${config.token}` }
      });
      expect(identity.status).toBe(200);
      if (postgresTls) {
        expect(postgresTls.counts.plaintext).toBe(0);
        expect(postgresTls.counts.encrypted).toBeGreaterThanOrEqual(2);
      }
    } catch (error) {
      operationFailed = true;
      operationError = error;
    }
    const cleanup = await Promise.allSettled([
      child && exit ? stopProcess(child, exit) : Promise.resolve(),
      registryProcess
        ? stopProcess(registryProcess.server, registryProcess.exited).then(() => postgresTls?.close())
        : postgresTls?.close(),
      logSink ? stopLogSink(logSink.server) : Promise.resolve(),
      sql ? sql.end({ timeout: 3 }) : Promise.resolve()
    ]);
    try {
      await closeOwnedDatabase(database);
    } catch (error) {
      cleanup.push({ status: 'rejected', reason: error });
    }
    const errors = cleanup.filter((result) => result.status === 'rejected').map((result) => result.reason);
    if (errors.length) {
      throw new AggregateError(operationFailed ? [operationError, ...errors] : errors, 'Login cleanup failed');
    }
    if (operationFailed) throw operationError;
  });
}

async function verifyFullLoginUnderHostileEnvironment(): Promise<void> {
  const original = { ...process.env };
  try {
    Object.assign(process.env, {
      E2E_LOGIN_DATABASE_URL: 'postgresql://test:test@127.0.0.1:9/ignored_test',
      PGHOST: 'remote.invalid',
      PGPORT: '1',
      PGDATABASE: 'production',
      PGPASSWORD: 'hostile-test-password',
      PGOPTIONS: '-c statement_timeout=1',
      PGTARGETSESSIONATTRS: 'hostile-invalid-value',
      NODE_OPTIONS: '--require=/dev/null/hostile-test-module',
      UNRELATED_TEST_SECRET: 'hostile-test-secret',
      AWS_SECRET_ACCESS_KEY: 'hostile-test-secret'
    });
    await verifyFullLogin();
  } finally {
    replaceEnvironment(original);
  }
}

it.skipIf(!enabled || process.platform === 'win32')(
  'isolates schema launchers from hostile environment and dotenv',
  async () => {
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
  }
);

it.skipIf(!enabled || process.platform === 'win32')(
  'logs in with a real CLI and verifies the issued token',
  verifyFullLoginUnderHostileEnvironment,
  0
);

it.skipIf(!enabled || process.platform === 'win32')(
  'logs in through a real browser with verified PostgreSQL TLS',
  () => verifyFullLogin(true),
  0
);

it.skipIf(!enabled || process.platform === 'win32')(
  'rejects a wrong-host PostgreSQL certificate before either login database sends credentials',
  async () => {
    await withPrivateEnvironment(async (sandbox) => {
      const database = await createOwnedTestDatabase(false);
      let tls: Awaited<ReturnType<typeof createOwnedPostgresTls>> | undefined;
      let registry: Awaited<ReturnType<typeof startRegistry>> | undefined;
      try {
        tls = await createOwnedPostgresTls(database, sandbox, true);
        registry = await startRegistry(tls.url, 'http://127.0.0.1:0', '', tls.certificate, true);
        const headers = { 'Content-Type': 'application/json', Origin: registry.base };
        const start = await fetch(`${registry.base}/api/v1/cli-auth/start`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ state: randomUUID() }),
          signal: AbortSignal.timeout(20_000)
        });
        const attemptsAfterStart = tls.counts.attempted;
        const signin = await fetch(`${registry.base}/api/auth/sign-in/email`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ email: 'isolated@example.test', password: 'test-password' }),
          signal: AbortSignal.timeout(20_000)
        });
        expect(start.status).toBe(500);
        expect(signin.ok).toBe(false);
        expect(attemptsAfterStart).toBeGreaterThan(0);
        expect(tls.counts.attempted).toBeGreaterThan(attemptsAfterStart);
        await stopProcess(registry.server, registry.exited);
        registry = undefined;
        registry = await startRegistry(tls.url, 'http://127.0.0.1:0', '', tls.certificate, true, 'selfhosted');
        const selfhostStart = await fetch(`${registry.base}/api/v1/cli-auth/start`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Origin: registry.base },
          body: JSON.stringify({ state: randomUUID() }),
          redirect: 'manual',
          signal: AbortSignal.timeout(20_000)
        });
        expect(selfhostStart.status).toBe(302);
        expect(selfhostStart.headers.get('location')).toBe('/setup');
        for (const endpoint of ['test-db', 'check-db']) {
          const before = tls.counts.attempted;
          const setup = await fetch(`${registry.base}/api/setup/${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Origin: registry.base },
            body: JSON.stringify({ useEnv: true }),
            signal: AbortSignal.timeout(20_000)
          });
          expect(setup.status, endpoint).toBe(400);
          expect(tls.counts.attempted, endpoint).toBeGreaterThan(before);
        }
        expect(tls.counts.plaintext).toBe(0);
        expect(tls.counts.decryptedBytes).toBe(0);
      } finally {
        try {
          if (registry) await stopProcess(registry.server, registry.exited);
        } finally {
          try {
            if (tls) await tls.close();
          } finally {
            await closeOwnedDatabase(database);
          }
        }
      }
    });
  },
  0
);

it.skipIf(!enabled || process.platform === 'win32')(
  'never lets startup or schema tooling bypass a configured PostgreSQL CA',
  async () => {
    await withPrivateEnvironment(async (sandbox) => {
      const database = await createOwnedTestDatabase(true);
      let tls: Awaited<ReturnType<typeof createOwnedPostgresTls>> | undefined;
      const root = path.resolve(__dirname, '../..');
      const runScript = async (args: string[], cwd = root, command: 'bun' | 'sh' = 'bun'): Promise<number> => {
        if (!tls) throw new Error('TLS relay is unavailable');
        const child = spawn(command, command === 'bun' ? isolatedBunArguments(args) : args, {
          cwd,
          env: {
            PATH: process.env.PATH,
            HOME: sandbox,
            TMPDIR: sandbox,
            DOTENV_CONFIG_PATH: '/dev/null',
            BUN_CONFIG_NO_DOTENV: '1',
            DATABASE_URL: tls.url,
            DATABASE_SSL_CA: tls.certificate,
            NODE_TLS_REJECT_UNAUTHORIZED: '0',
            BETTER_AUTH_SECRET: 'local-startup-test-secret-123456789',
            FIRST_ADMIN_EMAIL: 'startup-test@example.test',
            FIRST_ADMIN_PASSWORD: 'local-startup-test-password',
            AUTO_MIGRATE: 'true'
          }
        });
        child.stdout.resume();
        child.stderr.resume();
        const exited = new Promise<number | null>((resolve, reject) => {
          child.once('error', reject);
          child.once('close', resolve);
        });
        try {
          const code = await withinDeadline(exited, AbortSignal.timeout(8_000));
          if (code === null) throw new Error('Startup script exited on a signal');
          return code;
        } finally {
          await stopProcess(
            child,
            exited.catch(() => undefined)
          );
        }
      };
      try {
        tls = await createOwnedPostgresTls(database, sandbox);
        const extensionStatus = await runScript(['scripts/ensure-pg-trgm.mjs']);
        expect(tls.counts.plaintext).toBe(0);
        expect(extensionStatus).toBe(0);
        expect(tls.counts.encrypted).toBeGreaterThan(0);
        let encrypted = tls.counts.encrypted;
        expect(await runScript(['apps/registry/scripts/load-settings-from-db.ts'])).toBe(0);
        expect(tls.counts.encrypted).toBeGreaterThan(encrypted);
        encrypted = tls.counts.encrypted;
        expect(await runScript(['apps/registry/scripts/bootstrap-headless.ts'])).toBe(0);
        expect(tls.counts.encrypted).toBeGreaterThan(encrypted);
        encrypted = tls.counts.encrypted;
        await verifyEntrypoint(tls, sandbox, true);
        expect(tls.counts.encrypted).toBeGreaterThan(encrypted);
        const attempts = tls.counts.attempted;
        expect(
          await runScript(['./node_modules/drizzle-kit/bin.cjs', 'push', '--force'], path.join(root, 'apps/registry'))
        ).toBeGreaterThan(0);
        expect(tls.counts.attempted).toBe(attempts);
        expect(tls.counts.plaintext).toBe(0);
        await tls.close();
        tls = undefined;
        tls = await createOwnedPostgresTls(database, sandbox, true);
        const beforeLoader = tls.counts.attempted;
        await verifyEntrypoint(tls, sandbox, false);
        expect(tls.counts.attempted).toBeGreaterThan(beforeLoader);
        for (const [args, cwd, command] of [
          [['scripts/ensure-pg-trgm.mjs'], root, 'bun'],
          [['apps/registry/scripts/load-settings-from-db.ts'], root, 'bun'],
          [['apps/registry/scripts/bootstrap-headless.ts'], root, 'bun'],
          [['./node_modules/drizzle-kit/bin.cjs', 'push', '--force'], path.join(root, 'apps/registry'), 'bun'],
          [['apps/registry/scripts/entrypoint.sh'], root, 'sh']
        ] as [string[], string, 'bun' | 'sh'][]) {
          expect(await runScript(args, cwd, command)).toBeGreaterThan(0);
        }
        expect(tls.counts.plaintext).toBe(0);
        expect(tls.counts.decryptedBytes).toBe(0);
      } finally {
        try {
          if (tls) await tls.close();
        } finally {
          await closeOwnedDatabase(database);
        }
      }
    });
  },
  0
);

it.skipIf(!enabled || process.platform === 'win32')(
  'cleans up a real owned Redis service acquired after a setup timeout',
  async () => {
    await withPrivateEnvironment(async () => {
      const controller = new AbortController();
      let ready = () => {};
      let release = () => {};
      const created = new Promise<void>((resolve) => {
        ready = resolve;
      });
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      let containerId: string | undefined;
      const acquisition = acquireOwnedBeforeDeadline(
        async () => {
          const service = await createOwnedTestRedis();
          containerId = service.containerId;
          ready();
          await gate;
          return service;
        },
        (service) => service.close(),
        controller.signal
      );
      try {
        await Promise.race([
          created,
          acquisition.then(
            () => {
              throw new Error('Fixture unexpectedly completed before cancellation');
            },
            (error: unknown) => {
              throw error;
            }
          )
        ]);
        await new Promise<void>((resolve) => {
          setTimeout(() => {
            controller.abort(new Error('Synthetic setup timeout'));
            resolve();
          }, 25);
        });
        release();
        await expect(acquisition).rejects.toThrow('Owned fixture setup deadline exceeded');
        if (!containerId) throw new Error('Owned Redis was not created');
        await expect(runTestDocker(['inspect', containerId])).rejects.toThrow(/No such (object|container)/i);
      } finally {
        controller.abort();
        release();
        await acquisition.catch(() => undefined);
      }
    });
  },
  0
);

it.skipIf(!enabled || process.platform === 'win32')(
  'injects a transition failure only for the selected owned Redis session',
  async () => {
    await withPrivateEnvironment(async () => {
      const setup = AbortSignal.timeout(setupDeadlineMs);
      const service = await acquireOwnedBeforeDeadline(
        () => createOwnedTestRedis(),
        (redis) => redis.close(),
        setup
      );
      let proxy: OwnedRedisTransitionFault | undefined;
      let client: Redis | undefined;
      let observer: Redis | undefined;
      try {
        proxy = await acquireOwnedBeforeDeadline(
          () => createOwnedRedisTransitionFault(service, setup),
          (ownedProxy) => ownedProxy.close(),
          setup
        );
        const options = { lazyConnect: true, connectTimeout: 3_000, commandTimeout: 5_000, maxRetriesPerRequest: 0 };
        client = new Redis(proxy.url, options);
        observer = new Redis(service.url, options);
        let clientError: Error | undefined;
        let observerError: Error | undefined;
        client.on('error', (error) => {
          clientError ??= error;
        });
        observer.on('error', (error) => {
          observerError ??= error;
        });
        await Promise.all([client.connect(), observer.connect()]);
        const code = randomUUID();
        const key = `cli-auth:${code}`;
        const value = JSON.stringify({ status: 'pending', state: randomUUID() });
        await client.set(key, value, 'PX', 60_000);
        proxy.arm(key);
        expect(await client.get(key)).toBe(value);
        expect(await client.eval("return 'other'", 1, `cli-auth:${randomUUID()}`)).toBe('other');
        await expect(client.eval("return redis.call('GET', KEYS[1])", 1, key)).rejects.toThrow(
          'controlled authorization transition failure'
        );
        expect(proxy.counts()).toEqual({ targetReads: 1, rejectedTransitions: 1 });
        expect(await observer.get(key)).toBe(value);
        expect(clientError).toBeUndefined();
        expect(observerError).toBeUndefined();
      } finally {
        client?.disconnect();
        observer?.disconnect();
        try {
          if (proxy) await proxy.close();
        } finally {
          await service.close();
        }
      }
    });
  },
  0
);

async function verifyAuthorizationTransitionFailure(mode: 'built' | 'source'): Promise<void> {
  await withPrivateEnvironment(async () => {
    const setup = AbortSignal.timeout(setupDeadlineMs);
    let database: OwnedTestDatabase | undefined;
    let redis: OwnedTestRedis | undefined;
    let proxy: OwnedRedisTransitionFault | undefined;
    let registry: Awaited<ReturnType<typeof startRegistry>> | undefined;
    let observer: Redis | undefined;
    let failure: unknown;
    let failed = false;
    try {
      database = await acquireOwnedBeforeDeadline(() => createOwnedTestDatabase(true), closeOwnedDatabase, setup);
      redis = await acquireOwnedBeforeDeadline(
        () => createOwnedTestRedis(),
        (service) => service.close(),
        setup
      );
      const service = redis;
      proxy = await acquireOwnedBeforeDeadline(
        () => createOwnedRedisTransitionFault(service, setup),
        (ownedProxy) => ownedProxy.close(),
        setup
      );
      await assertOwnedTestDatabaseAlive(database);
      const databaseProbe = postgres(database.url, { max: 1, connect_timeout: 3 });
      try {
        await verifyTestDatabase(databaseProbe, validateTestDatabaseUrl(database.url));
      } finally {
        await databaseProbe.end({ timeout: 3 });
      }
      if (setup.aborted) throw new Error('Owned fixture setup deadline exceeded', { cause: setup.reason });
      registry =
        mode === 'built'
          ? await startRegistry(database.url, 'http://127.0.0.1:0', proxy.url)
          : await startSourceRegistry(database.url, proxy.url);
      if (setup.aborted) throw new Error('Owned fixture setup deadline exceeded', { cause: setup.reason });
      const base = registry.base;
      observer = new Redis(redis.url, {
        lazyConnect: true,
        connectTimeout: 3_000,
        commandTimeout: 5_000,
        maxRetriesPerRequest: 0,
        retryStrategy: () => null
      });
      let observerError: Error | undefined;
      observer.on('error', (error) => {
        observerError ??= error;
      });
      await observer.connect();
      await observer.select(15);
      const signal = AbortSignal.timeout(60_000);
      const json = { 'Content-Type': 'application/json', Origin: base };
      const unauthenticated = await fetch(`${base}/api/v1/cli-auth/authorize`, {
        method: 'POST',
        headers: json,
        body: JSON.stringify({ sessionCode: randomUUID() }),
        signal
      });
      expect(unauthenticated.status).toBe(401);
      const signup = await fetch(`${base}/api/auth/sign-up/email`, {
        method: 'POST',
        headers: json,
        body: JSON.stringify({
          name: 'CLI Test',
          email: `cli-store-outage-${randomUUID()}@example.test`,
          password: 'local-test-password-123'
        }),
        signal
      });
      expect(signup.status).toBe(200);
      const cookie = signup.headers
        .getSetCookie()
        .map((value) => value.split(';')[0])
        .join('; ');
      expect(cookie).not.toBe('');
      const authorize = (options: RequestInit) =>
        fetch(`${base}/api/v1/cli-auth/authorize`, {
          ...options,
          method: 'POST',
          headers: { Origin: base, cookie, ...options.headers },
          signal
        });
      expect((await authorize({})).status).toBe(400);
      expect((await authorize({ headers: json, body: '{' })).status).toBe(400);
      const state = randomUUID();
      const start = await fetch(`${base}/api/v1/cli-auth/start`, {
        method: 'POST',
        headers: json,
        body: JSON.stringify({ state }),
        signal
      });
      expect(start.status).toBe(200);
      const { sessionCode } = (await start.json()) as { sessionCode: string };
      let cursor = '0';
      const keys: string[] = [];
      do {
        const [next, found] = await observer.scan(cursor, 'MATCH', `cli-auth*:${sessionCode}`, 'COUNT', 100);
        cursor = next;
        keys.push(...found);
      } while (cursor !== '0');
      expect(keys).toHaveLength(1);
      const key = keys[0];
      const before = await observer.get(key);
      if (!before) throw new Error('Owned Redis did not contain the pending CLI session');
      expect(JSON.parse(before)).toMatchObject({ state, status: 'pending' });
      proxy.arm(key);
      const response = await authorize({ headers: json, body: JSON.stringify({ sessionCode }) });
      expect(proxy.counts().targetReads).toBeGreaterThan(0);
      expect(proxy.counts().rejectedTransitions).toBe(1);
      expect(await observer.get(key)).toBe(before);
      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({
        error: 'Unable to authorize authentication session. Please start login again.'
      });
      const retry = await authorize({ headers: json, body: JSON.stringify({ sessionCode }) });
      expect(retry.status).toBe(200);
      const authorized = await observer.get(key);
      if (!authorized) throw new Error('Owned Redis lost the authorized CLI session');
      expect(JSON.parse(authorized)).toMatchObject({ state, status: 'authorized' });
      expect(observerError).toBeUndefined();
    } catch (error) {
      failure = error;
      failed = true;
    }
    const cleanup = await Promise.allSettled([
      registry ? stopProcess(registry.server, registry.exited) : Promise.resolve(),
      Promise.resolve().then(() => observer?.disconnect())
    ]);
    for (const close of [
      proxy && (() => proxy.close()),
      redis && (() => redis.close()),
      database && (() => database.close())
    ]) {
      if (!close) continue;
      try {
        await close();
      } catch (error) {
        cleanup.push({ status: 'rejected', reason: error });
      }
    }
    const errors = cleanup.filter((result) => result.status === 'rejected').map((result) => result.reason);
    if (errors.length)
      throw new AggregateError(failed ? [failure, ...errors] : errors, 'Authorization fixture cleanup failed');
    if (failed) throw failure;
  });
}

// Resource factories own cleanup and have internal deadlines; do not let Vitest preempt late cleanup.
it.skipIf(!enabled || process.platform === 'win32')(
  'reports a real Redis authorization transition failure without blaming the request',
  () => verifyAuthorizationTransitionFailure('built'),
  0
);

it.skipIf(!enabled || process.platform === 'win32')(
  'reports a real Redis authorization transition failure from the source route',
  () => verifyAuthorizationTransitionFailure('source'),
  0
);
