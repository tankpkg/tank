/** Real HTTP, Better Auth and memory/Redis/PostgreSQL KV; login intent C14-C15. */
import { type ChildProcessWithoutNullStreams, execFile, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import { connect, createServer } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { promisify } from 'node:util';

import Redis from 'ioredis';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  blockedWriterPids,
  createOwnedTestRedis,
  isolatedAuthDatabaseUrl,
  isolatedAuthRedisUrl,
  type OwnedTestRedis,
  openVerifiedAuthDatabase,
  verifyAuthRedis,
  withVerifiedAuthDatabase
} from '../fixtures/auth-isolation';
import {
  assertOwnedTestDatabase,
  createOwnedTestDatabase,
  isolatedBunArguments,
  type OwnedTestDatabase,
  runTestDocker,
  testDockerEnvironment,
  withoutAmbientPostgres
} from '../helpers/isolated-test-database';

const enabled = process.env.E2E_ATOMIC_LOGIN === '1';
type Store = 'memory' | 'redis' | 'postgres';
let ownedDatabase: OwnedTestDatabase;
let ownedRedis: OwnedTestRedis;
let redisWithoutDb15: OwnedTestRedis;
let redisWithoutSelect: OwnedTestRedis;

beforeAll(async () => {
  if (!enabled) return;
  // Supplied URLs are checked but never used as write targets.
  isolatedAuthDatabaseUrl();
  isolatedAuthRedisUrl();
  try {
    ownedDatabase = await createOwnedTestDatabase(true);
    ownedRedis = await createOwnedTestRedis();
    redisWithoutDb15 = await createOwnedTestRedis(1);
    redisWithoutSelect = await createOwnedTestRedis(16, true);
  } catch (error) {
    await Promise.allSettled([
      ownedDatabase?.close(),
      ownedRedis?.close(),
      redisWithoutDb15?.close(),
      redisWithoutSelect?.close()
    ]);
    throw error;
  }
}, 1_200_000);

afterAll(async () => {
  if (!enabled) return;
  const results = await Promise.allSettled([
    redisWithoutSelect?.close(),
    redisWithoutDb15?.close(),
    ownedRedis?.close(),
    ownedDatabase?.close()
  ]);
  const failed = results.find((result) => result.status === 'rejected');
  if (failed?.status === 'rejected') throw failed.reason;
}, 60_000);

interface TestServer {
  base: string;
  applicationName: string;
  child: ChildProcessWithoutNullStreams;
  exited: Promise<void>;
}

async function startServer(store: Store, database: OwnedTestDatabase, redis: OwnedTestRedis): Promise<TestServer> {
  assertOwnedTestDatabase(database);
  if (store === 'redis') await verifyAuthRedis(redis);
  const registryDir = path.resolve(__dirname, '../../apps/registry');
  const fixture = path.resolve(__dirname, '../fixtures/cli-auth-atomic-server.mjs');
  const applicationName = `atomic-${randomUUID()}`;
  const child = spawn('bun', isolatedBunArguments([fixture]), {
    cwd: registryDir,
    env: {
      PATH: process.env.PATH,
      HOME: os.tmpdir(),
      NODE_PATH: path.join(registryDir, 'node_modules'),
      NODE_ENV: 'test',
      TANK_MODE: 'cloud',
      E2E_AUTH_STORE: store,
      PGAPPNAME: applicationName,
      DATABASE_URL: database.url,
      REDIS_URL: store === 'redis' ? redis.url : '',
      APP_URL: 'http://127.0.0.1:5555',
      BETTER_AUTH_SECRET: 'isolated-cli-auth-test-secret-123456789',
      LOKI_URL: 'http://127.0.0.1:1'
    }
  });
  const exited = new Promise<void>((resolve) => child.once('close', () => resolve()));
  let output = '';
  child.stderr.on('data', (chunk: Buffer) => {
    output += chunk.toString();
  });
  try {
    const base = await new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(`Auth fixture did not start: ${output}`)), 45_000);
      child.stdout.on('data', (chunk: Buffer) => {
        output += chunk.toString();
        const match = output.match(/ATOMIC_TEST_SERVER=(http:\/\/127\.0\.0\.1:\d+)/);
        if (match) {
          clearTimeout(timeout);
          resolve(match[1]);
        }
      });
      child.once('error', reject);
      child.once('close', () => {
        clearTimeout(timeout);
        reject(new Error(`Auth fixture exited: ${output}`));
      });
    });
    return { base, applicationName, child, exited };
  } catch (error) {
    await stopServer({ base: '', applicationName, child, exited });
    throw error;
  }
}

async function stopServer(server: TestServer): Promise<void> {
  if (server.child.exitCode === null && server.child.signalCode === null) server.child.kill('SIGTERM');
  const timeout = setTimeout(() => server.child.kill('SIGKILL'), 2_000);
  try {
    await server.exited;
  } finally {
    clearTimeout(timeout);
  }
}

async function post(base: string, route: string, body: unknown, cookie?: string): Promise<Response> {
  return fetch(`${base}${route}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie, Origin: base } : {}) },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000)
  });
}

describe('auth test endpoint isolation', () => {
  it('does not load synthetic dotenv credentials in the fixture Bun invocation', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tank-auth-dotenv-'));
    try {
      fs.writeFileSync(path.join(dir, '.env'), 'RESEND_API_KEY=synthetic-secret\nPGSSL=require\n');
      const run = promisify(execFile);
      const result = await run(
        'bun',
        isolatedBunArguments(['-e', 'process.stdout.write(JSON.stringify(process.env))']),
        {
          cwd: dir,
          env: { PATH: process.env.PATH, HOME: dir, NODE_ENV: 'test' },
          timeout: 10_000
        }
      );
      const actual = JSON.parse(result.stdout);
      expect(actual.RESEND_API_KEY).toBeUndefined();
      expect(actual.PGSSL).toBeUndefined();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects a TCP Docker endpoint before contacting it', async () => {
    let connections = 0;
    const server = createServer((socket) => {
      connections++;
      socket.destroy();
    });
    await new Promise<void>((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve));
    const previous = process.env.DOCKER_HOST;
    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Could not bind test endpoint');
      process.env.DOCKER_HOST = `tcp://127.0.0.1:${address.port}`;
      expect(() => testDockerEnvironment()).toThrow(/local Unix socket/);
      await expect(
        runTestDocker(['version'], 5_000, { PATH: process.env.PATH, DOCKER_HOST: process.env.DOCKER_HOST })
      ).rejects.toThrow(/unverified test Docker environment/i);
      expect(connections).toBe(0);
    } finally {
      if (previous === undefined) delete process.env.DOCKER_HOST;
      else process.env.DOCKER_HOST = previous;
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    }
  });

  it('rejects a Unix Docker path that is not a socket', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tank-auth-docker-'));
    const previous = process.env.DOCKER_HOST;
    try {
      const file = path.join(dir, 'not-a-socket');
      fs.writeFileSync(file, 'synthetic');
      process.env.DOCKER_HOST = `unix://${file}`;
      expect(() => testDockerEnvironment()).toThrow(/not a Unix socket/);
    } finally {
      if (previous === undefined) delete process.env.DOCKER_HOST;
      else process.env.DOCKER_HOST = previous;
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it.skipIf(!enabled)('ignores ambient Docker contexts and credentials', () => {
    const context = process.env.DOCKER_CONTEXT;
    const config = process.env.DOCKER_CONFIG;
    const tls = process.env.DOCKER_TLS_VERIFY;
    process.env.DOCKER_CONTEXT = 'synthetic-remote-context';
    process.env.DOCKER_CONFIG = '/synthetic/credentials';
    process.env.DOCKER_TLS_VERIFY = '1';
    try {
      const env = testDockerEnvironment();
      expect(env.DOCKER_HOST).toMatch(/^unix:\/\/\//);
      expect(env.DOCKER_CONTEXT).toBeUndefined();
      expect(env.DOCKER_TLS_VERIFY).toBeUndefined();
      expect(env.DOCKER_CONFIG).not.toBe('/synthetic/credentials');
    } finally {
      if (context === undefined) delete process.env.DOCKER_CONTEXT;
      else process.env.DOCKER_CONTEXT = context;
      if (config === undefined) delete process.env.DOCKER_CONFIG;
      else process.env.DOCKER_CONFIG = config;
      if (tls === undefined) delete process.env.DOCKER_TLS_VERIFY;
      else process.env.DOCKER_TLS_VERIFY = tls;
    }
  });

  it('does not apply ambient postgres driver options', async () => {
    const ssl = process.env.PGSSL;
    const target = process.env.PGTARGETSESSIONATTRS;
    process.env.PGSSL = 'require';
    process.env.PGTARGETSESSIONATTRS = 'read-only';
    const sql = withoutAmbientPostgres(() => postgres('postgresql://test:test@127.0.0.1:1/safe_test'));
    try {
      expect(sql.options.ssl).toBe(false);
      expect(sql.options.target_session_attrs).toBeUndefined();
    } finally {
      await sql.end({ timeout: 3 });
      if (ssl === undefined) delete process.env.PGSSL;
      else process.env.PGSSL = ssl;
      if (target === undefined) delete process.env.PGTARGETSESSIONATTRS;
      else process.env.PGTARGETSESSIONATTRS = target;
    }
  });
  it.each([
    'postgresql://test:test@127.0.0.1:5432/safe_test?database=production',
    'postgresql://test:test@127.0.0.1:5432/safe_test?dbname=production',
    'postgresql://test:test@127.0.0.1:5432/safe_test?host=example.com',
    'postgresql://test:test@127.0.0.1:5432/safe_test?',
    'postgresql://test:test@127.0.0.1:5432/safe_test#',
    'postgresql://user@remote.invalid%2C127.0.0.1@localhost:5432/safe_test',
    'postgresql://test@127.0.0.1:5432/safe_test',
    'postgresql://test:test@127.0.0.1:5432/production',
    'postgresql://test:test@example.com:5432/safe_test'
  ])('rejects unsafe PostgreSQL URL without connecting: %s', (url) => {
    const previous = process.env.E2E_AUTH_DATABASE_URL;
    process.env.E2E_AUTH_DATABASE_URL = url;
    try {
      expect(() => isolatedAuthDatabaseUrl()).toThrow();
    } finally {
      if (previous === undefined) delete process.env.E2E_AUTH_DATABASE_URL;
      else process.env.E2E_AUTH_DATABASE_URL = previous;
    }
  });

  it.each([
    'redis://127.0.0.1:6379/15?db=0',
    'redis://127.0.0.1:6379/15?',
    'redis://127.0.0.1:6379/15#',
    'redis://127.0.0.1:6379/15\n',
    'redis://127.0.0.1:6379/other/../15',
    'redis://127.0.0.1:6379/%31%35',
    'redis://127.0.0.1:6379/0',
    'redis://127.0.0.1:6379',
    'redis://127.0.0.1/15',
    'redis://127.0.0.1:0/15',
    'redis://user:password@127.0.0.1:6379/15',
    'redis://@127.0.0.1:6379/15',
    'redis://example.com:6379/15'
  ])('rejects unsafe Redis URL without connecting: %s', (url) => {
    const previous = process.env.E2E_AUTH_REDIS_URL;
    process.env.E2E_AUTH_REDIS_URL = url;
    try {
      expect(() => isolatedAuthRedisUrl()).toThrow();
    } finally {
      if (previous === undefined) delete process.env.E2E_AUTH_REDIS_URL;
      else process.env.E2E_AUTH_REDIS_URL = previous;
    }
  });

  it('accepts explicit isolated PostgreSQL and Redis endpoints', () => {
    const previousDatabase = process.env.E2E_AUTH_DATABASE_URL;
    const previousRedis = process.env.E2E_AUTH_REDIS_URL;
    const database = 'postgresql://test:test@127.0.0.1:5432/safe_test';
    const redis = 'redis://127.0.0.1:6379/15';
    process.env.E2E_AUTH_DATABASE_URL = database;
    process.env.E2E_AUTH_REDIS_URL = redis;
    try {
      expect(isolatedAuthDatabaseUrl()).toBe(database);
      expect(isolatedAuthRedisUrl()).toBe(redis);
    } finally {
      if (previousDatabase === undefined) delete process.env.E2E_AUTH_DATABASE_URL;
      else process.env.E2E_AUTH_DATABASE_URL = previousDatabase;
      if (previousRedis === undefined) delete process.env.E2E_AUTH_REDIS_URL;
      else process.env.E2E_AUTH_REDIS_URL = previousRedis;
    }
  });

  it.skipIf(!enabled)('rejects owned Redis without database 15 before starting a writer', async () => {
    expect(await redisWithoutDb15.dbZeroSize()).toBe(0);
    await expect(startServer('redis', ownedDatabase, redisWithoutDb15)).rejects.toThrow(/DB index is out of range/i);
    expect(await redisWithoutDb15.dbZeroSize()).toBe(0);
  });

  it.skipIf(!enabled)('rejects owned Redis that denies SELECT before starting a writer', async () => {
    expect(await redisWithoutSelect.dbZeroSize()).toBe(0);
    await expect(startServer('redis', ownedDatabase, redisWithoutSelect)).rejects.toThrow(/NOPERM|permission/i);
    expect(await redisWithoutSelect.dbZeroSize()).toBe(0);
  });

  it.skipIf(!enabled)(
    'keeps the Redis port reserved if its owned container stops',
    async () => {
      const stopped = await createOwnedTestRedis();
      const replacement = new Redis(ownedRedis.url, { lazyConnect: true, retryStrategy: () => null });
      const impostor = createServer((client) => {
        const upstream = connect({ host: '127.0.0.1', port: Number(new URL(ownedRedis.url).port) });
        client.on('error', () => upstream.destroy());
        upstream.on('error', () => client.destroy());
        client.pipe(upstream).pipe(client);
      });
      const key = `tank-test:rebind:${randomUUID()}`;
      try {
        await verifyAuthRedis(stopped);
        await runTestDocker(['stop', stopped.containerId], 30_000);
        const port = Number(new URL(stopped.url).port);
        const bindError = await new Promise<NodeJS.ErrnoException | null>((resolve) => {
          impostor.once('error', resolve);
          impostor.listen(port, '127.0.0.1', () => resolve(null));
        });
        await replacement.connect();
        expect(await replacement.get(key)).toBeNull();
        const writer = new Redis(stopped.url, { lazyConnect: true, connectTimeout: 3_000, retryStrategy: () => null });
        writer.on('error', () => undefined);
        try {
          if (bindError) {
            expect(bindError.code).toBe('EADDRINUSE');
            await expect(writer.connect()).rejects.toThrow();
          } else {
            await writer.connect();
            await writer.set(key, 'unexpected-substitute-write');
          }
          expect(await replacement.get(key)).toBeNull();
        } finally {
          writer.disconnect();
        }
      } finally {
        try {
          if (replacement.status === 'ready') await replacement.del(key);
        } finally {
          replacement.disconnect();
          if (impostor.listening) await new Promise<void>((resolve) => impostor.close(() => resolve()));
          await stopped.close();
        }
      }
    },
    240_000
  );
});

describe.skipIf(!enabled).each<Store>(['memory', 'redis', 'postgres'])('%s CLI sessions', (store) => {
  const email = `atomic-login-${randomUUID()}@example.test`;
  const codes: string[] = [];
  const servers: TestServer[] = [];
  let guardSql: postgres.Sql | undefined;
  let verificationFailed = false;
  let cookie = '';
  let userId = '';

  beforeAll(async () => {
    guardSql = await openVerifiedAuthDatabase(ownedDatabase);
    servers.push(await verifiedOperation(() => startServer(store, ownedDatabase, ownedRedis)));
    if (store !== 'memory') servers.push(await verifiedOperation(() => startServer(store, ownedDatabase, ownedRedis)));

    const signup = await fixturePost(servers[0].base, '/api/auth/sign-up/email', {
      name: 'Atomic Login Test',
      email,
      password: 'local-test-password-123'
    });
    expect(signup.status).toBe(200);
    const body = (await signup.json()) as { user: { id: string } };
    userId = body.user.id;
    cookie = signup.headers
      .getSetCookie()
      .map((value) => value.split(';')[0])
      .join('; ');
    expect(cookie).not.toBe('');
  }, 180_000);

  afterAll(async () => {
    const sql = guardSql;
    let cleanupVerified = false;
    try {
      if (sql && !verificationFailed) {
        await verifiedOperation(async () => {
          cleanupVerified = true;
          if (servers.length) {
            const response = await post(servers[0].base, '/__test/cleanup', { codes });
            expect(response.status).toBe(200);
          }
        });
      }
    } finally {
      await Promise.all(servers.map(stopServer));
      if (sql) {
        try {
          if (cleanupVerified && !verificationFailed) {
            await verifiedOperation(async () => {
              const users = await sql`SELECT id FROM "user" WHERE email = ${email}`;
              for (const user of users) {
                await sql`DELETE FROM apikey WHERE user_id = ${user.id} OR reference_id = ${user.id}`;
                await sql`DELETE FROM "user" WHERE id = ${user.id} AND email = ${email}`;
              }
            });
          }
        } finally {
          await sql.end({ timeout: 3 });
        }
      }
    }
  }, 90_000);

  async function verifiedOperation<T>(operation: () => Promise<T>): Promise<T> {
    if (!guardSql || verificationFailed) throw new Error('Auth fixture database verification failed');
    let verified = false;
    try {
      return await withVerifiedAuthDatabase(guardSql, ownedDatabase, async () => {
        if (store === 'redis') await verifyAuthRedis(ownedRedis);
        verified = true;
        return operation();
      });
    } catch (error) {
      if (!verified) verificationFailed = true;
      throw error;
    }
  }

  function fixturePost(base: string, route: string, body: unknown, sessionCookie?: string): Promise<Response> {
    return verifiedOperation(() => post(base, route, body, sessionCookie));
  }

  async function startSession(): Promise<{ sessionCode: string; state: string }> {
    const state = randomUUID();
    const response = await fixturePost(servers[0].base, '/api/v1/cli-auth/start', { state });
    expect(response.status).toBe(200);
    const { sessionCode } = (await response.json()) as { sessionCode: string };
    codes.push(sessionCode);
    return { sessionCode, state };
  }

  async function startLegacySession(status: 'pending' | 'authorized'): Promise<{ sessionCode: string; state: string }> {
    // Reuse a real CLI session code and state, but keep only its pre-cutover entry.
    const session = await startSession();
    expect((await fixturePost(servers[0].base, '/__test/cleanup', { codes: [session.sessionCode] })).status).toBe(200);
    const created = await fixturePost(servers[0].base, '/__test/legacy-session', { ...session, userId, email, status });
    expect(created.status).toBe(200);
    expect(await created.json()).toEqual({ sessionCode: session.sessionCode });
    return session;
  }

  function authorize(sessionCode: string, index = 0): Promise<Response> {
    return fixturePost(servers[index % servers.length].base, '/api/v1/cli-auth/authorize', { sessionCode }, cookie);
  }

  function exchange(session: { sessionCode: string; state: string }, index = 0): Promise<Response> {
    return fixturePost(servers[index % servers.length].base, '/api/v1/cli-auth/exchange', session);
  }

  async function sessionStatus(sessionCode: string): Promise<string | null> {
    const response = await fixturePost(servers[0].base, '/__test/session-status', { sessionCode });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { status: string | null };
    return body.status;
  }

  async function waitForSessionExpiry(sessionCode: string): Promise<void> {
    await expect.poll(() => sessionStatus(sessionCode), { timeout: 15_000, interval: 100 }).toBeNull();
  }

  it('leaves pending and mismatched sessions usable by the legitimate client', async () => {
    const session = await startSession();
    expect((await exchange(session)).status).toBe(400);
    expect((await authorize(session.sessionCode, 1)).status).toBe(200);
    expect((await exchange({ ...session, state: randomUUID() }, 1)).status).toBe(400);
    const response = await exchange(session);
    expect(response.status).toBe(200);
    const body = (await response.json()) as { token: string; user: { email: string; name: string } };
    expect(body.token).toMatch(/^tank_/);
    expect(body.user).toEqual({ email, name: 'Atomic Login Test' });
    expect((await exchange(session)).status).toBe(400);
  });

  it.each([
    'pending',
    'authorized'
  ] as const)('rejects a pre-cutover %s session and lets the same client start a fresh login', async (status) => {
    const sql = await openVerifiedAuthDatabase(ownedDatabase);
    try {
      const before =
        await sql`SELECT count(*)::int AS count FROM apikey WHERE user_id = ${userId} OR reference_id = ${userId}`;
      const legacy = await startLegacySession(status);
      // The direct exchange case must not be altered by the authorization attempt.
      const exchangeLegacy = status === 'authorized' ? await startLegacySession(status) : legacy;
      const authorization = await authorize(legacy.sessionCode, 1);
      expect(authorization.status).toBeGreaterThanOrEqual(400);
      expect(authorization.status).toBeLessThan(500);
      const rejected = await exchange(exchangeLegacy, 1);
      expect(rejected.status).toBeGreaterThanOrEqual(400);
      expect(rejected.status).toBeLessThan(500);
      expect(await rejected.text()).not.toMatch(/\btank_[A-Za-z0-9_-]+/);
      const afterLegacy =
        await sql`SELECT count(*)::int AS count FROM apikey WHERE user_id = ${userId} OR reference_id = ${userId}`;
      expect(afterLegacy[0].count).toBe(before[0].count);

      const fresh = await startSession();
      expect((await authorize(fresh.sessionCode, 1)).status).toBe(200);
      const response = await exchange(fresh, 1);
      expect(response.status).toBe(200);
      const body = (await response.json()) as { token: string; user: { email: string; name: string } };
      expect(body.token).toMatch(/^tank_/);
      expect(body.user).toEqual({ email, name: 'Atomic Login Test' });
      expect((await exchange(fresh, 1)).status).toBe(400);
      const afterFresh =
        await sql`SELECT count(*)::int AS count FROM apikey WHERE user_id = ${userId} OR reference_id = ${userId}`;
      expect(afterFresh[0].count - before[0].count).toBe(1);
    } finally {
      await sql.end({ timeout: 3 });
    }
  });

  it('issues exactly one token for concurrent matching exchanges across instances', async () => {
    const session = await startSession();
    expect((await authorize(session.sessionCode)).status).toBe(200);
    const sql = await openVerifiedAuthDatabase(ownedDatabase);
    try {
      const before =
        await sql`SELECT count(*)::int AS count FROM apikey WHERE user_id = ${userId} OR reference_id = ${userId}`;
      const responses = await verifiedOperation(() =>
        Promise.all(
          Array.from({ length: 16 }, (_, index) =>
            post(servers[index % servers.length].base, '/api/v1/cli-auth/exchange', session)
          )
        )
      );
      expect(responses.filter((response) => response.status === 200)).toHaveLength(1);
      expect(responses.filter((response) => response.status === 400)).toHaveLength(15);
      const after =
        await sql`SELECT count(*)::int AS count FROM apikey WHERE user_id = ${userId} OR reference_id = ${userId}`;
      expect(after[0].count - before[0].count).toBe(1);
    } finally {
      await sql.end({ timeout: 3 });
    }
  });

  it('atomically consumes a session when calls share one store instance', async () => {
    const session = await startSession();
    expect((await authorize(session.sessionCode)).status).toBe(200);
    const response = await fixturePost(servers[0].base, '/__test/race-consume', session);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ successes: 1 });
    expect((await exchange(session)).status).toBe(400);
  });

  it('cannot resurrect a consumed session after an authorization reads stale pending data', async () => {
    const session = await startSession();
    expect((await fixturePost(servers[0].base, '/__test/arm-stale', { sessionCode: session.sessionCode })).status).toBe(
      200
    );
    const stale = fixturePost(servers[0].base, '/__test/authorize-stale', {
      sessionCode: session.sessionCode,
      userId,
      email
    });
    try {
      await expect
        .poll(
          async () => {
            const response = await fixturePost(servers[0].base, '/__test/stale-status', {});
            return response.json();
          },
          { timeout: 6_000 }
        )
        .toEqual({ reached: true, status: 'pending' });
      expect((await authorize(session.sessionCode, 1)).status).toBe(200);
      expect((await exchange(session, 1)).status).toBe(200);
      expect(await (await fixturePost(servers[0].base, '/__test/stale-status', {})).json()).toEqual({
        reached: true,
        status: 'pending'
      });
    } finally {
      await fixturePost(servers[0].base, '/__test/release-stale', {});
    }
    expect(await (await stale).json()).toEqual({ authorized: false });
    expect((await exchange(session, 1)).status).toBe(400);
  });

  it('rejects an expired authorized session', async () => {
    const session = await startSession();
    expect((await authorize(session.sessionCode)).status).toBe(200);
    expect((await fixturePost(servers[0].base, '/__test/expire', { sessionCode: session.sessionCode })).status).toBe(
      200
    );
    await waitForSessionExpiry(session.sessionCode);
    expect((await exchange(session, 1)).status).toBe(400);
  });

  it('preserves a pending session expiry when it is authorized', async () => {
    const sql = store === 'postgres' ? await openVerifiedAuthDatabase(ownedDatabase) : undefined;
    const redis =
      store === 'redis' ? new Redis(ownedRedis.url, { lazyConnect: true, retryStrategy: () => null }) : undefined;
    try {
      if (redis) await verifiedOperation(() => redis.connect());
      const session = await startSession();
      const key = `cli-auth-v2:${session.sessionCode}`;
      const ttlMs = 5_000;
      expect(
        (await fixturePost(servers[0].base, '/__test/expire', { sessionCode: session.sessionCode, ttlMs })).status
      ).toBe(200);
      // The memory store and this test share a host; remote stores are observed on their own clocks below.
      const memoryDeadline = performance.now() + ttlMs + 100;
      const beforeRedis = redis ? await redis.pexpiretime(key) : undefined;
      const beforePostgres = sql
        ? await sql<{ expires_at: string; live: boolean }[]>`
            SELECT expires_at::text, expires_at > clock_timestamp() AS live FROM kv_store WHERE key = ${key}
          `
        : undefined;
      if (beforeRedis !== undefined) expect(beforeRedis).toBeGreaterThan(0);
      if (beforePostgres) expect(beforePostgres).toMatchObject([{ live: true }]);
      expect((await authorize(session.sessionCode, 1)).status).toBe(200);
      expect(await sessionStatus(session.sessionCode)).toBe('authorized');
      if (redis) expect(await redis.pexpiretime(key)).toBe(beforeRedis);
      if (sql) {
        const after = await sql<{ expires_at: string; live: boolean }[]>`
          SELECT expires_at::text, expires_at > clock_timestamp() AS live FROM kv_store WHERE key = ${key}
        `;
        expect(after).toEqual(beforePostgres);
      }
      if (store === 'memory') await delay(Math.max(0, memoryDeadline - performance.now()));
      else await waitForSessionExpiry(session.sessionCode);
      expect((await exchange(session)).status).toBe(400);
    } finally {
      redis?.disconnect();
      if (sql) await sql.end({ timeout: 3 });
    }
  });

  it.skipIf(store !== 'postgres').each(['consume', 'authorize'] as const)(
    'does not %s a session that expires while its row is locked',
    async (operation) => {
      const session = await startSession();
      if (operation === 'consume') expect((await authorize(session.sessionCode)).status).toBe(200);
      const key = `cli-auth-v2:${session.sessionCode}`;
      const sql = await openVerifiedAuthDatabase(ownedDatabase, 2);
      const connection = await sql.reserve();
      let locked = false;
      let barrierArmed = false;
      let pending: Promise<PromiseSettledResult<Response>[]> | undefined;
      try {
        const [{ pid: holderPid }] = await connection<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
        expect(
          (await fixturePost(servers[1].base, '/__test/arm-stale', { sessionCode: session.sessionCode })).status
        ).toBe(200);
        barrierArmed = true;
        pending = Promise.allSettled([
          operation === 'consume' ? exchange(session, 1) : authorize(session.sessionCode, 1)
        ]);
        await expect
          .poll(async () => (await fixturePost(servers[1].base, '/__test/stale-status', {})).json(), { timeout: 6_000 })
          .toEqual({ reached: true, status: operation === 'consume' ? 'authorized' : 'pending' });
        // Commit the near expiry before taking the lock; the real session then expires while the writer waits.
        expect(
          await sql`UPDATE kv_store SET expires_at = clock_timestamp() + interval '4 seconds' WHERE key = ${key}
            RETURNING key`
        ).toHaveLength(1);
        await connection`BEGIN`;
        locked = true;
        expect(await connection`SELECT key FROM kv_store WHERE key = ${key} FOR UPDATE`).toHaveLength(1);
        expect((await fixturePost(servers[1].base, '/__test/release-stale', {})).status).toBe(200);
        barrierArmed = false;
        await expect
          .poll(() => blockedWriterPids(sql, servers[1].applicationName, holderPid), { timeout: 6_000, interval: 50 })
          .toHaveLength(1);
        const [{ live }] = await connection<{ live: boolean }[]>`
          SELECT expires_at > clock_timestamp() AS live FROM kv_store WHERE key = ${key}
        `;
        expect(live).toBe(true);
        await connection`SELECT pg_sleep(GREATEST(0, EXTRACT(EPOCH FROM (expires_at - clock_timestamp()))) + 0.1)
          FROM kv_store WHERE key = ${key}`;
        const [{ expired }] = await connection<{ expired: boolean }[]>`
          SELECT expires_at <= clock_timestamp() AS expired FROM kv_store WHERE key = ${key}
        `;
        expect(expired).toBe(true);
        await connection`COMMIT`;
        locked = false;
        const [result] = await pending;
        if (result.status === 'rejected') throw result.reason;
        expect(result.value.status).toBe(400);
        expect((await exchange(session)).status).toBe(400);
      } finally {
        try {
          if (locked) await connection`ROLLBACK`;
        } finally {
          try {
            if (barrierArmed) await fixturePost(servers[1].base, '/__test/release-stale', {});
          } finally {
            if (pending) await pending;
            connection.release();
            await sql.end({ timeout: 3 });
          }
        }
      }
    }
  );

  it.skipIf(store !== 'postgres')('enforces the real invitation email limit again in a new window', async () => {
    const rateEmail = `atomic-rate-${randomUUID()}@example.test`;
    const key = `email:rate:${rateEmail}`;
    const sql = await openVerifiedAuthDatabase(ownedDatabase);
    try {
      for (let window = 0; window < 2; window++) {
        if (window === 1) {
          await withVerifiedAuthDatabase(sql, ownedDatabase, async () => {
            await sql`UPDATE kv_store SET expires_at = clock_timestamp() - interval '1 second' WHERE key = ${key}`;
          });
        }
        const responses = await Promise.all(
          Array.from({ length: 4 }, () => fixturePost(servers[0].base, '/__test/email-rate', { email: rateEmail }))
        );
        expect(responses.every((response) => response.status === 200)).toBe(true);
        const limits = await Promise.all(responses.map((response) => response.json()));
        expect(limits.filter((limit) => limit.allowed)).toHaveLength(3);
        expect(limits.filter((limit) => !limit.allowed)).toHaveLength(1);
      }
    } finally {
      try {
        await withVerifiedAuthDatabase(sql, ownedDatabase, async () => {
          await sql`DELETE FROM kv_store WHERE key = ${key}`;
        });
      } finally {
        await sql.end({ timeout: 3 });
      }
    }
  });
});
