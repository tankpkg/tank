// @vitest-environment node
import { createServer } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createMemoryStore } from '../memory';
import {
  assertPinnedEndpoint,
  type OwnedServices,
  startOwnedServices,
  verifyAbruptOwnerCleanup,
  verifyNoDotenv,
  verifyRejectedEnvironment
} from './pr492-owned-services';

describe('owned test-service boundary', () => {
  it('rejects external targets and proxies before any connection', async () => {
    let connections = 0;
    const sentinel = createServer((socket) => {
      connections++;
      socket.destroy();
    });
    await new Promise<void>((resolve) => sentinel.listen(0, '127.0.0.1', resolve));
    const address = sentinel.address();
    if (!address || typeof address === 'string') throw new Error('Sentinel has no loopback listener');
    try {
      const target = `127.0.0.1:${address.port}`;
      await expect(
        startOwnedServices('postgres', { PR492_TEST_POSTGRES_URL: `postgresql://review@${target}/review` })
      ).rejects.toThrow(/forbidden/);
      await expect(
        startOwnedServices('postgres', { DATABASE_URL: `postgresql://review@${target}/review` })
      ).rejects.toThrow(/forbidden/);
      await expect(startOwnedServices('redis', { PR492_TEST_REDIS_URL: `redis://${target}` })).rejects.toThrow(
        /forbidden/
      );
      await expect(startOwnedServices('redis', { REDIS_URL: `redis://${target}` })).rejects.toThrow(/forbidden/);
      await expect(startOwnedServices('redis', { HTTPS_PROXY: `http://${target}` })).rejects.toThrow(/forbidden/);
      await expect(startOwnedServices('redis', { ALL_PROXY: `socks5://${target}` })).rejects.toThrow(/forbidden/);
      await expect(startOwnedServices('redis', { DOCKER_HOST: `tcp://${target}` })).rejects.toThrow(/forbidden/);
      await verifyRejectedEnvironment('PR492_TEST_POSTGRES_URL', `postgresql://review@${target}/review`);
      await verifyRejectedEnvironment('HTTPS_PROXY', `http://${target}`);
      await verifyRejectedEnvironment('DOCKER_HOST', `tcp://${target}`);
      await verifyNoDotenv();
      expect(() => assertPinnedEndpoint(`redis://example.com:${address.port}`, 'redis:', address.port)).toThrow();
      expect(() => assertPinnedEndpoint(`redis://${target}?proxy=1`, 'redis:', address.port)).toThrow();
      expect(connections).toBe(0);
    } finally {
      await new Promise<void>((resolve, reject) => sentinel.close((error) => (error ? reject(error) : resolve())));
    }
  });

  it.skipIf(process.env.PR492_ISOLATED_CONFIG !== '1')(
    'reaps owned resources after an abrupt test-worker exit',
    async () => {
      await verifyAbruptOwnerCleanup();
    },
    180_000
  );
});

describe('in-memory KV expiry', () => {
  it('does not extend a TTL if the process wall clock moves backward', async () => {
    const store = createMemoryStore();
    const realNow = Date.now;
    try {
      Date.now = () => realNow() + 6 * 60_000;
      await store.set('review:clock', 'value', 150);
    } finally {
      Date.now = realNow;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(await store.get('review:clock')).toBeNull();
  });
});

describe.skipIf(process.env.PR492_ISOLATED_CONFIG !== '1')('CLI session cutover against owned PostgreSQL', () => {
  let services: OwnedServices;
  beforeAll(async () => {
    services = await startOwnedServices('postgres');
  }, 180_000);
  afterAll(async () => {
    if (services) await services.close();
  }, 180_000);

  it('rejects all unverifiable legacy sessions and protects new store-timed sessions', async () => {
    const script = `
      import postgres from 'postgres';
      import { randomUUID } from 'node:crypto';
      async function main() {
        const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false });
        const { getKVStore } = await import('./src/services/kv/index.ts');
        const sessions = await import('./src/lib/auth/cli-store.ts');
        const store = getKVStore();
        const state = randomUUID();
        const legacyCode = randomUUID();
        const legacyAuthorizedCode = randomUUID();
        const skewedCode = randomUUID();
        let code;
        let slowCode;
        const realNow = Date.now;
        try {
          Date.now = () => realNow() + 6 * 60_000;
          code = await sessions.createSession(state);
          Date.now = () => realNow() - 6 * 60_000;
          slowCode = await sessions.createSession(state);
          Date.now = realNow;
          const rows = await sql.unsafe('SELECT EXTRACT(EPOCH FROM (expires_at - clock_timestamp())) AS seconds FROM kv_store WHERE key = $1', ['cli-auth-v2:' + code]);
          const legacy = JSON.stringify({ state, status: 'pending', createdAt: realNow() });
          const legacyAuthorized = JSON.stringify({ state, status: 'authorized', userId: 'review-user', createdAt: realNow() });
          const skewed = JSON.stringify({ state, status: 'pending', createdAt: realNow() + 6 * 60_000 });
          await store.set('cli-auth:' + legacyCode, legacy, 300_000);
          await store.set('cli-auth:' + legacyAuthorizedCode, legacyAuthorized, 300_000);
          await sql.unsafe("INSERT INTO kv_store (key, value, expires_at) VALUES ($1, $2, clock_timestamp() + interval '11 minutes')", ['cli-auth:' + skewedCode, skewed]);
          const legacyVisible = !!(await sessions.getSession(legacyCode));
          const legacyAccepted = await sessions.authorizeSession(legacyCode, 'review-user');
          const legacyConsumed = !!(await sessions.consumeSession(legacyAuthorizedCode, state));
          const skewedAccepted = await sessions.authorizeSession(skewedCode, 'review-user');
          const slowAuthorized = await sessions.authorizeSession(slowCode, 'review-user');
          const mismatchConsumed = !!(await sessions.consumeSession(slowCode, 'wrong-state'));
          const slowConsumed = !!(await sessions.consumeSession(slowCode, state));
          const repeated = !!(await sessions.consumeSession(slowCode, state));
          await sql.unsafe("UPDATE kv_store SET expires_at = clock_timestamp() - interval '1 second' WHERE key = $1", ['cli-auth-v2:' + code]);
          const expiredAuthorized = await sessions.authorizeSession(code, 'review-user');
          const lockedCode = await sessions.createSession(state);
          let locked;
          let release;
          const lockedRow = new Promise((resolve) => { locked = resolve; });
          const released = new Promise((resolve) => { release = resolve; });
          const holder = sql.begin(async (tx) => {
            await tx.unsafe("UPDATE kv_store SET expires_at = clock_timestamp() + interval '150 milliseconds' WHERE key = $1", ['cli-auth-v2:' + lockedCode]);
            locked();
            await released;
          });
          await lockedRow;
          const waiting = sessions.authorizeSession(lockedCode, 'review-user');
          await new Promise((resolve) => setTimeout(resolve, 300));
          release();
          await holder;
          const lockedExpiredAuthorized = await waiting;
          console.log(JSON.stringify({ seconds: Number(rows[0].seconds), legacyVisible, legacyAccepted, legacyConsumed,
            skewedAccepted, slowAuthorized, mismatchConsumed, slowConsumed, repeated, expiredAuthorized, lockedExpiredAuthorized }));
        } finally {
          Date.now = realNow;
          await sql.end();
        }
      }
      main().then(() => process.exit(0), (error) => { console.error(error); process.exit(1); });
    `;
    const { stdout } = await services.runBun(script);
    const result = JSON.parse(stdout.trim().split('\n').at(-1) ?? '') as {
      seconds: number;
      legacyVisible: boolean;
      legacyAccepted: boolean;
      legacyConsumed: boolean;
      skewedAccepted: boolean;
      slowAuthorized: boolean;
      mismatchConsumed: boolean;
      slowConsumed: boolean;
      repeated: boolean;
      expiredAuthorized: boolean;
      lockedExpiredAuthorized: boolean;
    };
    expect(result.seconds).toBeGreaterThan(285);
    expect(result.seconds).toBeLessThanOrEqual(300);
    expect(result.legacyVisible).toBe(false);
    expect(result.legacyAccepted).toBe(false);
    expect(result.legacyConsumed).toBe(false);
    expect(result.skewedAccepted).toBe(false);
    expect(result.slowAuthorized).toBe(true);
    expect(result.mismatchConsumed).toBe(false);
    expect(result.slowConsumed).toBe(true);
    expect(result.repeated).toBe(false);
    expect(result.expiredAuthorized).toBe(false);
    expect(result.lockedExpiredAuthorized).toBe(false);
  }, 75_000);

  it('accepts the unchanged v0.16.3 and v0.16.4 CLI login implementation over the real API', async () => {
    const script = `
      import { execFile } from 'node:child_process';
      import { randomUUID } from 'node:crypto';
      import { mkdir, readFile, rm, rmdir } from 'node:fs/promises';
      import { basename, join, resolve } from 'node:path';
      import { promisify } from 'node:util';
      import postgres from 'postgres';
      import { drizzle } from 'drizzle-orm/postgres-js';
      import { migrate } from 'drizzle-orm/postgres-js/migrator';
      import { Hono } from 'hono';

      async function main() {
        const git = promisify(execFile);
        const cliDir = resolve(process.cwd(), '../../packages/cli');
        const repoDir = resolve(process.cwd(), '../..');
        const current = await readFile(join(cliDir, 'src/commands/login.ts'), 'utf8');
        for (const tag of ['v0.16.3', 'v0.16.4']) {
          const old = await git('/usr/bin/git', ['show', tag + ':packages/cli/src/commands/login.ts'], {
            cwd: repoDir, env: { HOME: process.env.HOME, PATH: '/usr/bin:/bin', GIT_CONFIG_NOSYSTEM: '1' }
          });
          if (old.stdout !== current) throw Error('Current CLI login no longer matches ' + tag);
        }
        const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false });
        let handler;
        let onStart;
        const exchangeResponses = [];
        const server = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch(request) {
          if (!handler) throw Error('API handler is not ready');
          return handler(request);
        }});
        const base = 'http://127.0.0.1:' + server.port;
        process.env.APP_URL = base;
        process.env.BETTER_AUTH_URL = base;
        process.env.BETTER_AUTH_SECRET = 'review-only-secret-with-at-least-32-characters';
        process.env.TANK_MODE = 'selfhosted';
        process.env.AUTH_PROVIDERS = 'credentials';
        process.env.LOKI_URL = base;
        const emptyPath = join(process.env.HOME, 'empty-bin-' + randomUUID());
        await mkdir(emptyPath);
        try {
          await migrate(drizzle(sql), { migrationsFolder: './drizzle' });
          // This historical migration is not journaled. Apply it as an extra
          // prerequisite only for this healthy fixture; journal-only databases lack it.
          await sql.unsafe(await readFile('./drizzle/0007_parched_scream.sql', 'utf8'));
          const columns = await sql.unsafe("SELECT is_nullable FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'apikey' AND column_name = 'user_id'");
          const { auth } = await import('./src/lib/auth/core.ts');
          const { cliAuthRoutes } = await import('./src/api/routes/v1/cli-auth.ts');
          const app = new Hono();
          app.on(['GET', 'POST'], '/api/auth/*', (context) => auth.handler(context.req.raw));
          app.route('/api/v1/cli-auth', cliAuthRoutes);
          handler = async (request) => {
            const response = await app.fetch(request);
            if (new URL(request.url).pathname === '/api/v1/cli-auth/start' && response.ok && onStart) {
              const body = await response.clone().json();
              onStart(body);
            }
            if (new URL(request.url).pathname === '/api/v1/cli-auth/exchange' && exchangeResponses.length < 5) {
              exchangeResponses.push({ status: response.status, body: await response.clone().text() });
            }
            return response;
          };
          const signup = await fetch(base + '/api/auth/sign-up/email', {
            method: 'POST', headers: { 'content-type': 'application/json', origin: base },
            body: JSON.stringify({ name: 'Review User', email: 'review@example.invalid', password: 'review-only-password-123' })
          });
          if (!signup.ok) throw Error('Signup failed: ' + signup.status + ' ' + await signup.text());
          const cookie = signup.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ');
          if (!cookie) throw Error('Signup did not return a session cookie');
          const configDir = join(process.env.HOME, 'cli-config-' + randomUUID());
          const configFile = join(configDir, 'config.json');
          const start = new Promise((resolve) => { onStart = resolve; });
          // The opener can spawn its bundled xdg-open by absolute path, even when
          // PATH is empty. Guard the real opener's process boundary before
          // loading the historical login implementation; never launch a browser.
          const cliScript = \`
            import childProcess from 'node:child_process';
            import { syncBuiltinESMExports } from 'node:module';
            const attempts = [];
            childProcess.spawn = (command, args) => {
              attempts.push({ command, args });
              throw Error('Browser launches are disabled in this isolated test');
            };
            syncBuiltinESMExports();
            const { loginCommand } = await import('./src/commands/login.ts');
            await loginCommand({ configDir: process.env.TEST_CONFIG_DIR, timeout: 5000, pollInterval: 50 });
            console.log('PR492_SPAWN_ATTEMPTS ' + JSON.stringify(attempts));
            process.exit(0);
          \`;
          const cli = Bun.spawn([process.execPath, '--no-env-file', '--no-install', '-e', cliScript], {
            cwd: cliDir,
            env: { HOME: process.env.HOME, TMPDIR: process.env.TMPDIR, PATH: emptyPath, NODE_ENV: 'test',
              TANK_REGISTRY_URL: base, TANK_LOKI_URL: base, TANK_MODE: 'selfhosted', TANK_TELEMETRY: '0',
              TEST_CONFIG_DIR: configDir, BUN_CONFIG_NO_DOTENV: '1', BUN_RUNTIME_TRANSPILER_CACHE_PATH: '0', DO_NOT_TRACK: '1' },
            stdin: 'ignore', stdout: 'pipe', stderr: 'pipe'
          });
          const cliOut = new Response(cli.stdout).text();
          const cliErr = new Response(cli.stderr).text();
          try {
            const started = await Promise.race([start, cli.exited.then((status) => { throw Error('CLI exited early: ' + status); }),
              new Promise((_, reject) => setTimeout(() => reject(Error('CLI did not start a session')), 20_000))]);
            const authorization = await fetch(base + '/api/v1/cli-auth/authorize', {
              method: 'POST', headers: { 'content-type': 'application/json', origin: base, cookie },
              body: JSON.stringify({ sessionCode: started.sessionCode })
            });
            if (!authorization.ok) throw Error('Authorization failed: ' + authorization.status + ' ' + await authorization.text());
            const status = await cli.exited;
            const output = await cliOut;
            const errors = await cliErr;
            if (status !== 0) throw Error('CLI failed: ' + status + ' ' + output + ' ' + errors + ' exchanges=' + JSON.stringify(exchangeResponses) + ' apikey.user_id nullable=' + columns[0]?.is_nullable);
            const attemptsLine = output.split('\\n').find((line) => line.startsWith('PR492_SPAWN_ATTEMPTS '));
            const attempts = JSON.parse(attemptsLine?.slice('PR492_SPAWN_ATTEMPTS '.length) ?? 'null');
            const config = JSON.parse(await readFile(configFile, 'utf8'));
            const verification = await auth.api.verifyApiKey({ body: { key: config.token } });
            console.log('PR492_RESULT ' + JSON.stringify({ historicalTagsMatch: true, tokenVerified: verification.valid === true,
              user: config.user?.email,
              browserWasNotOpened: Array.isArray(attempts) && attempts.length === 1 &&
                ['open', 'xdg-open'].includes(basename(attempts[0].command)) &&
                JSON.stringify(attempts[0].args) === JSON.stringify([started.authUrl]) &&
                (output + errors).includes('Could not open browser') && (output + errors).includes(started.authUrl) }));
          } finally {
            if (cli.exitCode === null) cli.kill('SIGKILL');
            await rm(configFile, { force: true });
            await rmdir(configDir).catch((error) => { if (error.code !== 'ENOENT') throw error; });
          }
        } finally {
          server.stop(true);
          await sql.end();
          await rmdir(emptyPath);
        }
      }
      main().then(() => process.exit(0), (error) => { console.error(error); process.exit(1); });
    `;
    let stdout: string;
    try {
      ({ stdout } = await services.runBun(script, 120_000));
    } catch (error) {
      const details = error as { stdout?: string; stderr?: string };
      throw new Error(`Owned CLI/API run failed: ${details.stdout ?? ''}\n${details.stderr ?? ''}`, { cause: error });
    }
    const line = stdout.split('\n').find((item) => item.startsWith('PR492_RESULT '));
    const result = JSON.parse(line?.slice('PR492_RESULT '.length) ?? '') as {
      historicalTagsMatch: boolean;
      tokenVerified: boolean;
      user: string;
      browserWasNotOpened: boolean;
    };
    expect(result.historicalTagsMatch).toBe(true);
    expect(result.tokenVerified).toBe(true);
    expect(result.user).toBe('review@example.invalid');
    expect(result.browserWasNotOpened).toBe(true);
  }, 135_000);
});
