/** Real migrated PostgreSQL and registry auth routes; never targets a supplied database. */
import { type ChildProcessWithoutNullStreams, execFile, spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import postgres from 'postgres';
import { expect, it } from 'vitest';

import {
  assertOwnedTestDatabaseAlive,
  isolatedBunArguments,
  isolatedSchemaEnvironment,
  type OwnedTestDatabase
} from '../helpers/isolated-test-database.js';
import {
  closeOwnedDatabase,
  createReadyDatabase,
  withPrivateEnvironment
} from '../helpers/owned-ui-fixture-harness.js';

const enabled = process.env.E2E_MIGRATED_API_KEYS === '1';
const root = fileURLToPath(new URL('../../', import.meta.url));
const registry = path.join(root, 'apps/registry');
const exec = promisify(execFile);

async function migrate(database: OwnedTestDatabase): Promise<void> {
  await assertOwnedTestDatabaseAlive(database);
  await exec('bun', isolatedBunArguments(['node_modules/.bin/drizzle-kit', 'migrate']), {
    cwd: registry,
    env: isolatedSchemaEnvironment(database.url),
    timeout: 120_000
  });
}

async function pushSchema(database: OwnedTestDatabase): Promise<void> {
  await assertOwnedTestDatabaseAlive(database);
  const directory = await mkdtemp(path.join(tmpdir(), 'pr492-schema-push-'));
  const config = path.join(directory, 'drizzle.config.ts');
  try {
    // kv_store is managed separately and is not part of the registry Drizzle schema.
    const schema = ['schema.ts', 'auth-schema.ts'].map((name) => path.join(registry, 'src/lib/db', name));
    await writeFile(
      config,
      `export default { dialect: 'postgresql', schema: ${JSON.stringify(schema)}, tablesFilter: ['!kv_store'], dbCredentials: { url: process.env.DATABASE_URL } };\n`
    );
    const result = await exec(
      'bun',
      isolatedBunArguments(['node_modules/.bin/drizzle-kit', 'push', '--force', `--config=${config}`]),
      { cwd: registry, env: isolatedSchemaEnvironment(database.url), timeout: 120_000 }
    );
    if (!/Changes applied|No changes detected/.test(result.stdout)) {
      throw new Error(`Schema push did not complete: ${result.stderr}`);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function stop(child: ChildProcessWithoutNullStreams, exited: Promise<void>): Promise<void> {
  if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
  const timeout = setTimeout(() => child.kill('SIGKILL'), 2_000);
  try {
    await exited;
  } finally {
    clearTimeout(timeout);
  }
}

async function cleanup(operations: Promise<unknown>[]): Promise<void> {
  const results = await Promise.allSettled(operations);
  const errors = results.filter((result) => result.status === 'rejected').map((result) => result.reason);
  if (errors.length) throw new AggregateError(errors, 'Migration test cleanup failed');
}

async function startRegistry(database: OwnedTestDatabase) {
  await assertOwnedTestDatabaseAlive(database);
  const source = `
    import { OpenAPIHono } from '@hono/zod-openapi';
    import { betterAuth } from 'better-auth';
    import { drizzleAdapter } from 'better-auth/adapters/drizzle';
    import { apiKey } from '@better-auth/api-key';
    import { auth } from './src/lib/auth/core.ts';
    import { withApiKeyRequest } from './src/lib/auth/api-key-safety.ts';
    import { db, sql as dbSql } from './src/lib/db/index.ts';
    import { verifyCliAuth } from './src/lib/auth/authz.ts';
    import { cliAuthRoutes } from './src/api/routes/v1/cli-auth.ts';
    import { authRoutes } from './src/api/routes/v1/auth.ts';
    import { skillsPublishRoutes } from './src/api/routes/v1/skills-publish.ts';
    import { skillsConfirmRoutes } from './src/api/routes/v1/skills-confirm.ts';
    import { requireAuth } from './src/api/middleware/require-auth.ts';
    import { requireAdmin } from './src/api/middleware/require-admin.ts';
    import { serviceAccountsRoutes } from './src/api/routes/admin/service-accounts.ts';
    const app = new OpenAPIHono();
    const disconnected = new Set();
    app.use('*', async (c, next) => {
      const id = c.req.header('x-test-request-id');
      if (id) c.req.raw.signal.addEventListener('abort', () => disconnected.add(id), { once: true });
      await next();
    });
    const legacyAuth = betterAuth({
      database: drizzleAdapter(db, { provider: 'pg' }),
      baseURL: 'http://127.0.0.1:5555',
      secret: 'local-migration-test-secret-123456789',
      plugins: [apiKey({ defaultPrefix: 'tank_' })]
    });
    app.on(['GET', 'POST'], '/api/auth/*', (c) => auth.handler(c.req.raw));
    app.route('/api/v1/cli-auth', cliAuthRoutes);
    app.route('/api/v1/auth', authRoutes);
    app.route('/api/v1/skills', skillsPublishRoutes);
    app.route('/api/v1/skills', skillsConfirmRoutes);
    app.use('/__test/protected', requireAuth());
    app.get('/__test/protected', (c) => c.json({ ok: true }));
    app.post('/__test/protected', async (c) => {
      await dbSql.unsafe('INSERT INTO pr492_protected_writes VALUES (1)');
      return c.json({ ok: true });
    });
    app.use('/__test/service-accounts/*', requireAdmin());
    app.route('/__test/service-accounts', serviceAccountsRoutes);
    const gates = new Map();
    app.post('/__test/gate/:id/arm', async (c) => {
      const { arrivals = 1 } = await c.req.json();
      let entered, firstEntered, release;
      const waiting = new Promise((resolve) => { entered = resolve; });
      const firstWaiting = new Promise((resolve) => { firstEntered = resolve; });
      const pause = new Promise((resolve) => { release = resolve; });
      gates.set(c.req.param('id'), { waiting, firstWaiting, pause, entered, firstEntered, release, arrivals, count: 0 });
      return c.body(null, 204);
    });
    app.get('/__test/gate/:id/wait', async (c) => {
      const gate = gates.get(c.req.param('id'));
      if (!gate) return c.body(null, 404);
      await gate.waiting;
      return c.body(null, 204);
    });
    app.get('/__test/gate/:id/first', async (c) => {
      const gate = gates.get(c.req.param('id'));
      if (!gate) return c.body(null, 404);
      await gate.firstWaiting;
      return c.body(null, 204);
    });
    app.post('/__test/gate/:id/release', (c) => {
      const gate = gates.get(c.req.param('id'));
      if (!gate) return c.body(null, 404);
      gate.release();
      return c.body(null, 204);
    });
    app.get('/__test/scopes', async (c) => {
      const verified = await verifyCliAuth(c.req.raw);
      return verified ? c.json({ scopes: verified.scopes }, 200) : c.json({ error: 'Unauthorized' }, 401);
    });
    app.post('/__test/delete-user/:id', async (c) => {
      const context = await auth.$context;
      try { await context.internalAdapter.deleteUser(c.req.param('id')); }
      catch (error) {
        if (typeof error?.statusCode === 'number') return c.json({ code: error.body?.code }, error.statusCode);
        throw error;
      }
      return c.body(null, 204);
    });
    app.post('/__test/verify-key', async (c) => {
      const { key } = await c.req.json();
      try {
        const result = await auth.api.verifyApiKey({ body: { key } });
        return c.json({ valid: result.valid, error: result.error });
      } catch (error) {
        if (typeof error?.statusCode === 'number') return c.json(error.body, error.statusCode);
        throw error;
      }
    });
    app.post('/__test/verify-key-response', async (c) => {
      const { key } = await c.req.json();
      return auth.api.verifyApiKey({ body: { key }, asResponse: true });
    });
    app.post('/__test/legacy-verify-key', async (c) => {
      const { key } = await c.req.json();
      const result = await legacyAuth.api.verifyApiKey({ body: { key } });
      return c.json({ valid: result.valid });
    });
    app.post('/__test/nested-verification', async (c) => {
      const { invalid, disputed } = await c.req.json();
      return withApiKeyRequest(async () => {
        const failed = await verifyCliAuth(new Request('http://127.0.0.1/', {
          headers: { Authorization: 'Bearer ' + invalid }
        }));
        const result = await auth.api.verifyApiKey({ body: { key: disputed } });
        return c.json({ failed: failed === null, valid: result.valid });
      });
    });
    app.post('/__test/concurrent-verifications', async (c) => {
      const { first, second } = await c.req.json();
      return withApiKeyRequest(async () => {
        const verify = (key) => verifyCliAuth(new Request('http://127.0.0.1/', {
          headers: { Authorization: 'Bearer ' + key }
        }));
        const [a, b] = await Promise.all([verify(first), verify(second)]);
        return c.json({ first: a?.userId ?? null, second: b?.userId ?? null });
      });
    });
    app.post('/__test/cancelled-parent-verification', async (c) => {
      const { key } = await c.req.json();
      return withApiKeyRequest(async () => {
        try {
          const result = await verifyCliAuth(new Request('http://127.0.0.1/', {
            headers: { Authorization: 'Bearer ' + key }
          }));
          return c.json({ valid: !!result });
        } catch {
          return c.json({ valid: false });
        }
      }, AbortSignal.abort());
    });
    app.post('/__test/raw-verification-pair', async (c) => {
      const { key } = await c.req.json();
      return withApiKeyRequest(async () => {
        const first = auth.api.verifyApiKey({ body: { key, permissions: { skills: ['admin'] } } });
        await waitAtGate('launch-second');
        const second = auth.api.verifyApiKey({ body: { key } });
        const [a, b] = await Promise.all([first, second]);
        return c.json({ first: a.valid, firstError: a.error?.code ?? null, second: b.valid });
      });
    });
    app.post('/__test/delete-key', async (c) => {
      try {
        return c.json(await auth.api.deleteApiKey({ body: await c.req.json(), headers: c.req.raw.headers }));
      } catch (error) {
        if (typeof error?.statusCode === 'number') return c.json({ code: error.body?.code }, error.statusCode);
        throw error;
      }
    });
    app.post('/__test/cleanup-expired', async (c) => {
      try { return c.json(await auth.api.deleteAllExpiredApiKeys()); }
      catch (error) {
        if (typeof error?.statusCode === 'number') return c.json({ code: error.body?.code }, error.statusCode);
        throw error;
      }
    });
    app.post('/__test/unsafe-bulk/:operation', async (c) => {
      const context = await auth.$context;
      if (c.req.param('operation') === 'update') {
        await context.adapter.updateMany({ model: 'apikey', where: [], update: { enabled: false } });
      } else {
        await context.adapter.deleteMany({ model: 'apikey', where: [
          { field: 'expiresAt', operator: 'lt', value: new Date() },
          { field: 'userId', value: 'not-the-owner' }
        ] });
      }
      return c.body(null, 204);
    });
    app.post('/__test/hold-pool', async (c) => {
      await dbSql.unsafe('SELECT pg_sleep(7)');
      return c.body(null, 204);
    });
    app.post('/__test/hold-pool-short', async (c) => {
      await dbSql.unsafe('SELECT pg_sleep(2)');
      return c.body(null, 204);
    });
    app.get('/__test/disconnected/:id', (c) => c.json({ aborted: disconnected.has(c.req.param('id')) }));
    app.post('/__test/create-key/:id', async (c) => {
      const result = await auth.api.createApiKey({ body: { name: 'Server key', userId: c.req.param('id') } });
      return c.json({ id: result.id, key: result.key });
    });
    app.post('/__test/transaction-key/:id', async (c) => {
      const context = await auth.$context;
      const created = await context.adapter.transaction((adapter) => adapter.create({
        model: 'apikey',
        data: {
          key: crypto.randomUUID(), configId: 'default', referenceId: c.req.param('id'),
          createdAt: new Date(), updatedAt: new Date()
        }
      }));
      return c.json({ id: created.id });
    });
    app.post('/__test/adapter-key', async (c) => {
      const { referenceId, userId, configId } = await c.req.json();
      const context = await auth.$context;
      const created = await context.adapter.create({
        model: 'apikey',
        data: {
          key: crypto.randomUUID(), configId, referenceId, userId,
          createdAt: new Date(), updatedAt: new Date()
        }
      });
      return c.json({ id: created.id });
    });
    const server = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: app.fetch });
    process.env.APP_URL = 'http://127.0.0.1:' + server.port;
    process.env.BETTER_AUTH_URL = process.env.APP_URL;
    const context = await auth.$context;
    // Exercise Better Auth's optional public endpoint without changing production configuration.
    context.options.user = { ...context.options.user, deleteUser: { enabled: true } };
    const originalUpdate = context.adapter.update.bind(context.adapter);
    const originalDelete = context.adapter.delete.bind(context.adapter);
    const waitAtGate = async (id) => {
      const gate = gates.get(id);
      if (gate) {
        gate.count++;
        if (gate.count === 1) gate.firstEntered();
        if (gate.count === gate.arrivals) gate.entered();
        await gate.pause;
        gates.delete(id);
      }
    };
    context.adapter.update = async (input) => {
      const id = input.where?.find((item) => item.field === 'id')?.value;
      if (input.model === 'apikey') await waitAtGate(input.update?.key ? id : 'update:' + id);
      try {
        const result = await originalUpdate(input);
        if (input.model === 'apikey' && input.update?.key) await waitAtGate('after:' + id);
        return result;
      } finally {
        if (input.model === 'apikey' && input.update?.key) await waitAtGate('settled:' + id);
      }
    };
    context.adapter.delete = async (input) => {
      const id = input.where?.find((item) => item.field === 'id')?.value;
      if (input.model === 'apikey') await waitAtGate('delete:' + id);
      return originalDelete(input);
    };
    console.log('TEST_REGISTRY=' + process.env.APP_URL);
  `;
  const child = spawn('bun', isolatedBunArguments(['-e', source]), {
    cwd: registry,
    env: {
      ...isolatedSchemaEnvironment(database.url),
      TANK_MODE: 'selfhosted',
      APP_URL: 'http://127.0.0.1:5555',
      REDIS_URL: '',
      LOKI_URL: 'http://127.0.0.1:0',
      BETTER_AUTH_SECRET: 'local-migration-test-secret-123456789'
    }
  });
  const exited = new Promise<void>((resolve) => child.once('close', () => resolve()));
  let output = '';
  child.stderr.on('data', (chunk: Buffer) => {
    output += chunk.toString();
  });
  try {
    const base = await new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(`Registry did not start: ${output}`)), 20_000);
      child.stdout.on('data', (chunk: Buffer) => {
        output += chunk.toString();
        const match = /TEST_REGISTRY=(http:\/\/127\.0\.0\.1:\d+)/.exec(output);
        if (match) {
          clearTimeout(timeout);
          resolve(match[1]);
        }
      });
      child.once('error', reject);
      child.once('close', () => {
        clearTimeout(timeout);
        reject(new Error(`Registry exited: ${output}`));
      });
    });
    return { base, close: () => stop(child, exited) };
  } catch (error) {
    await stop(child, exited);
    throw error;
  }
}

async function post(base: string, endpoint: string, body: unknown, cookie?: string): Promise<Response> {
  return fetch(`${base}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: base, ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify(body)
  });
}

async function signup(base: string) {
  const email = `migration-${randomUUID()}@example.test`;
  const response = await post(base, '/api/auth/sign-up/email', {
    name: 'Migration Test',
    email,
    password: 'local-test-password-123'
  });
  expect(response.status, 'signup').toBe(200);
  const body = (await response.json()) as { user: { id: string } };
  const cookie = response.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ');
  expect(cookie).not.toBe('');
  return { userId: body.user.id, email, cookie };
}

async function signupAdmin(base: string, sql: TestSql) {
  const account = await signup(base);
  await sql`UPDATE "user" SET role = 'admin' WHERE id = ${account.userId}`;
  return account;
}

async function login(base: string, cookie: string): Promise<string> {
  const state = randomUUID();
  const started = await post(base, '/api/v1/cli-auth/start', { state });
  expect(started.status, 'start').toBe(200);
  const { sessionCode } = (await started.json()) as { sessionCode: string };
  const authorized = await post(base, '/api/v1/cli-auth/authorize', { sessionCode }, cookie);
  expect(authorized.status, 'authorize').toBe(200);
  const exchanged = await post(base, '/api/v1/cli-auth/exchange', { sessionCode, state });
  expect(exchanged.status, 'exchange').toBe(200);
  return ((await exchanged.json()) as { token: string }).token;
}

async function whoami(base: string, token: string): Promise<Response> {
  return fetch(`${base}/api/v1/auth/whoami`, { headers: { Authorization: `Bearer ${token}` } });
}

async function waitForDisconnect(base: string, id: string): Promise<void> {
  const deadline = Date.now() + 4_000;
  while (Date.now() < deadline) {
    const response = await fetch(`${base}/__test/disconnected/${id}`);
    if (((await response.json()) as { aborted: boolean }).aborted) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error('Server did not observe the caller disconnect');
}

async function authHttpRequests(base: string, token: string): Promise<Response[]> {
  const authorization = { Authorization: `Bearer ${token}` };
  return Promise.all([
    whoami(base, token),
    fetch(`${base}/api/v1/skills`, {
      method: 'POST',
      headers: { ...authorization, 'Content-Type': 'application/json' },
      body: JSON.stringify({ manifest: {} })
    }),
    fetch(`${base}/api/v1/skills/confirm`, {
      method: 'POST',
      headers: { ...authorization, 'Content-Type': 'application/json' },
      body: JSON.stringify({ versionId: randomUUID(), integrity: 'sha512-test' })
    }),
    fetch(`${base}/__test/protected`, { headers: authorization })
  ]);
}

async function deleteUser(base: string, userId: string): Promise<void> {
  const response = await deleteUserResponse(base, userId);
  expect(response.status, 'Better Auth user deletion').toBe(204);
}

async function deleteUserResponse(base: string, userId: string): Promise<Response> {
  return post(base, `/__test/delete-user/${userId}`, {});
}

async function verifyPluginKey(base: string, key: string): Promise<boolean> {
  const response = await post(base, '/__test/verify-key', { key });
  expect(response.status, 'Better Auth key verification').toBe(200);
  return ((await response.json()) as { valid: boolean }).valid;
}

async function createBrowserKey(base: string, cookie: string): Promise<{ id: string; key: string }> {
  const response = await post(base, '/api/auth/api-key/create', { name: 'Browser key' }, cookie);
  expect(response.status, 'Better Auth browser key creation').toBe(200);
  return (await response.json()) as { id: string; key: string };
}

async function verifyDefaultHookBehavior(database: OwnedTestDatabase): Promise<void> {
  await assertOwnedTestDatabaseAlive(database);
  const source = `
    import postgres from 'postgres';
    import { betterAuth } from 'better-auth';
    import { drizzleAdapter } from 'better-auth/adapters/drizzle';
    import { apiKey } from '@better-auth/api-key';
    import { db } from './src/lib/db/index.ts';
    const sql = postgres(process.env.DATABASE_URL, { max: 1 });
    const calls = { user: 0, apikey: 0 };
    const auth = betterAuth({
      database: drizzleAdapter(db, { provider: 'pg' }),
      baseURL: 'http://127.0.0.1:5555',
      secret: 'local-migration-test-secret-123456789',
      emailAndPassword: { enabled: true },
      databaseHooks: {
        user: { create: { before: async () => { calls.user++; } } },
        apikey: { create: { before: async (data) => {
          calls.apikey++;
          return { data: { userId: data.referenceId } };
        } } }
      },
      plugins: [apiKey({ defaultPrefix: 'tank_' })]
    });
    try {
      const account = await auth.api.signUpEmail({ body: {
        name: 'Hook Probe', email: crypto.randomUUID() + '@example.test', password: 'local-test-password-123'
      } });
      const created = await auth.api.createApiKey({ body: { name: 'Hook Probe', userId: account.user.id } });
      const before = await sql.unsafe('SELECT user_id, reference_id FROM apikey WHERE id = $1', [created.id]);
      await (await auth.$context).internalAdapter.deleteUser(account.user.id);
      const after = await sql.unsafe('SELECT id FROM apikey WHERE id = $1', [created.id]);
      const verified = await auth.api.verifyApiKey({ body: { key: created.key } });
      console.log('HOOK_PROBE=' + JSON.stringify({
        calls, userId: before[0].user_id, referenceMatches: before[0].reference_id === account.user.id,
        remaining: after.length, validAfterDelete: verified.valid
      }));
    } finally { await sql.end({ timeout: 3 }); }
    process.exit(0);
  `;
  const { stdout } = await exec('bun', isolatedBunArguments(['-e', source]), {
    cwd: registry,
    env: { ...isolatedSchemaEnvironment(database.url), BETTER_AUTH_SECRET: 'local-migration-test-secret-123456789' },
    timeout: 30_000
  });
  const result = /HOOK_PROBE=(\{[^\n]+\})/.exec(stdout);
  if (!result) throw new Error(`Missing hook probe result: ${stdout}`);
  expect(JSON.parse(result[1])).toEqual({
    calls: { user: 1, apikey: 0 },
    userId: null,
    referenceMatches: true,
    remaining: 1,
    validAfterDelete: true
  });
}

async function verifyPushOnly(database: OwnedTestDatabase): Promise<void> {
  const server = await startRegistry(database);
  const sql = postgres(database.url, { max: 1, connect_timeout: 3 });
  try {
    const columns = await sql`SELECT is_nullable FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'apikey' AND column_name = 'user_id'`;
    expect(columns[0].is_nullable, 'push-only schema').toBe('YES');
    const history = await sql`SELECT to_regnamespace('drizzle') IS NOT NULL AS has_migration_schema`;
    expect(history[0].has_migration_schema, 'push-only database has no migration history').toBe(false);
    const account = await signup(server.base);
    const token = await login(server.base, account.cookie);
    expect((await whoami(server.base, token)).status).toBe(200);
    const keys = await sql`SELECT id, user_id, reference_id FROM apikey WHERE reference_id = ${account.userId}`;
    expect(keys).toHaveLength(1);
    expect(keys[0].user_id, 'push-only API key owner').toBe(account.userId);
    const browser = await createBrowserKey(server.base, account.cookie);
    expect((await whoami(server.base, browser.key)).status).toBe(200);
    const serverKeyResponse = await post(server.base, `/__test/create-key/${account.userId}`, {});
    expect(serverKeyResponse.status, 'Better Auth server key creation').toBe(200);
    const serverKey = (await serverKeyResponse.json()) as { id: string; key: string };
    expect((await whoami(server.base, serverKey.key)).status).toBe(200);
    const transaction = await post(server.base, `/__test/transaction-key/${account.userId}`, {});
    expect(transaction.status, 'adapter transaction key creation').toBe(200);
    const transactionId = ((await transaction.json()) as { id: string }).id;
    const moreKeys = await sql`SELECT id, user_id, reference_id FROM apikey WHERE reference_id = ${account.userId}`;
    expect(moreKeys).toHaveLength(4);
    expect(moreKeys.every((key) => key.user_id === account.userId)).toBe(true);
    expect(moreKeys.map((key) => key.id)).toContain(transactionId);
    const other = await signup(server.base);
    expect(
      (
        await post(server.base, '/__test/adapter-key', {
          referenceId: account.userId,
          userId: other.userId,
          configId: 'default'
        })
      ).status,
      'conflicting ownership is rejected'
    ).toBe(500);
    expect(
      (
        await post(server.base, '/__test/adapter-key', {
          referenceId: account.userId,
          configId: 'organization'
        })
      ).status,
      'unknown configuration is rejected'
    ).toBe(500);
    expect(await sql`SELECT id FROM apikey WHERE reference_id = ${account.userId}`).toHaveLength(4);
    await deleteUser(server.base, account.userId);
    expect(await sql`SELECT id FROM apikey WHERE reference_id = ${account.userId}`).toHaveLength(0);
    expect(await verifyPluginKey(server.base, token)).toBe(false);
    expect((await whoami(server.base, token)).status).toBe(401);
    expect((await whoami(server.base, browser.key)).status).toBe(401);
    expect((await whoami(server.base, serverKey.key)).status).toBe(401);
    expect((await post(server.base, `/__test/create-key/${account.userId}`, {})).status).toBe(500);
    expect(await sql`SELECT id FROM apikey WHERE reference_id = ${account.userId}`).toHaveLength(0);

    const oldAccount = await signup(server.base);
    const legacyToken = `tank_${randomUUID().replaceAll('-', '')}${randomUUID().replaceAll('-', '')}`;
    const legacyHash = createHash('sha256').update(legacyToken).digest('base64url');
    const legacyId = randomUUID();
    await sql`INSERT INTO apikey (id, name, key, user_id, created_at, updated_at)
      VALUES (${legacyId}, ${'Legacy key'}, ${legacyHash}, ${oldAccount.userId}, NOW(), NOW())`;
    const legacyBefore = await sql`SELECT id, key, user_id, reference_id FROM apikey WHERE id = ${legacyId}`;
    expect((await whoami(server.base, legacyToken)).status, 'push-only legacy key').toBe(200);
    await sql`INSERT INTO apikey (id, name, key, user_id, created_at, updated_at)
      VALUES (${randomUUID()}, ${'Duplicate legacy key'}, ${legacyHash}, ${oldAccount.userId}, NOW(), NOW())`;
    const duplicateIdentity = await whoami(server.base, legacyToken);
    expect(duplicateIdentity.status, 'duplicate valid key hash').toBe(200);
    expect((await duplicateIdentity.json()).userId).toBe(oldAccount.userId);

    const referenceAccount = await signup(server.base);
    const referenceToken = await login(server.base, referenceAccount.cookie);
    await sql`UPDATE apikey SET user_id = NULL WHERE reference_id = ${referenceAccount.userId}`;
    expect((await whoami(server.base, referenceToken)).status, 'existing reference-only key').toBe(200);
    const before = await sql`SELECT id, key, user_id, reference_id FROM apikey
      WHERE reference_id = ${referenceAccount.userId}`;
    const listed = await fetch(`${server.base}/api/auth/api-key/list`, {
      headers: { Cookie: referenceAccount.cookie, Origin: server.base }
    });
    expect(listed.status, 'existing reference-only key list').toBe(200);
    const listing = (await listed.json()) as { apiKeys: Array<{ id: string }> };
    expect(listing.apiKeys.map((key) => key.id)).toContain(before[0].id);
    await deleteUser(server.base, referenceAccount.userId);
    expect(await sql`SELECT id, key, user_id, reference_id FROM apikey WHERE id = ${before[0].id}`).toEqual(before);
    expect(await verifyPluginKey(server.base, referenceToken), 'orphan rejected by Better Auth').toBe(false);
    expect((await whoami(server.base, referenceToken)).status, 'orphan rejected by CLI auth').toBe(401);
    expect((await whoami(server.base, legacyToken)).status, 'unrelated legacy key remains usable').toBe(200);
    expect(await sql`SELECT id, key, user_id, reference_id FROM apikey WHERE id = ${legacyId}`).toEqual(legacyBefore);

    // Model a pre-existing conflict; Better Auth accepts the key itself but CLI auth must not.
    const firstOwner = await signup(server.base);
    const secondOwner = await signup(server.base);
    const ambiguousToken = await login(server.base, firstOwner.cookie);
    await sql`UPDATE apikey SET reference_id = ${secondOwner.userId} WHERE user_id = ${firstOwner.userId}`;
    const keysWithConflict = await sql`SELECT id FROM apikey WHERE user_id = ${firstOwner.userId}`;
    expect(keysWithConflict).toHaveLength(1);
    expect(await verifyPluginKey(server.base, ambiguousToken), 'conflicting key rejected by Better Auth').toBe(false);
    const ambiguous = await sql`SELECT * FROM apikey WHERE id = ${keysWithConflict[0].id}`;
    expect((await whoami(server.base, ambiguousToken)).status, 'conflicting owner fields').toBe(401);
    expect(await sql`SELECT * FROM apikey WHERE id = ${keysWithConflict[0].id}`).toEqual(ambiguous);
    await sql`INSERT INTO apikey (id, name, key, user_id, reference_id, created_at, updated_at)
      VALUES (${randomUUID()}, ${'Matching duplicate'}, ${ambiguous[0].key}, ${firstOwner.userId}, ${firstOwner.userId}, NOW(), NOW())`;
    const duplicatesBefore = await sql`SELECT * FROM apikey WHERE key = ${ambiguous[0].key} ORDER BY id`;
    expect((await whoami(server.base, ambiguousToken)).status, 'conflict among duplicate hashes').toBe(401);
    expect(await sql`SELECT * FROM apikey WHERE key = ${ambiguous[0].key} ORDER BY id`).toEqual(duplicatesBefore);
  } finally {
    await cleanup([sql.end({ timeout: 3 }), server.close()]);
  }
}

async function verifyFresh(database: OwnedTestDatabase): Promise<void> {
  await migrate(database);
  const server = await startRegistry(database);
  const sql = postgres(database.url, { max: 1, connect_timeout: 3 });
  try {
    const columns = await sql`SELECT is_nullable FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'apikey' AND column_name = 'user_id'`;
    expect(columns[0].is_nullable, 'fresh migrated schema').toBe('NO');
    const account = await signup(server.base);
    const token = await login(server.base, account.cookie);
    const identity = await whoami(server.base, token);
    expect(identity.status, 'journal-only schema fails closed').toBe(503);
    const keys = await sql`SELECT id, user_id, reference_id FROM apikey WHERE reference_id = ${account.userId}`;
    expect(keys).toHaveLength(1);
    expect(keys[0].user_id).toBe(account.userId);
    expect(keys[0].reference_id).toBe(account.userId);
    const browser = await createBrowserKey(server.base, account.cookie);
    expect((await whoami(server.base, browser.key)).status, 'browser key before schema repair').toBe(503);
    const browserRows = await sql`SELECT user_id, reference_id FROM apikey WHERE id = ${browser.id}`;
    expect(browserRows).toEqual([{ user_id: account.userId, reference_id: account.userId }]);
    const beforePush = await sql`SELECT * FROM apikey WHERE id = ${keys[0].id}`;
    const kvBefore = await sql`SELECT to_regclass('public.kv_store') AS name`;
    // Test-only filtered push supplies the missing relation; existing keys and KV must survive it.
    await pushSchema(database);
    expect(
      (await sql`SELECT to_regclass('public.service_accounts') AS name`)[0].name,
      'schema push creates relation'
    ).not.toBeNull();
    expect(await sql`SELECT to_regclass('public.kv_store') AS name`, 'schema push preserves KV table').toEqual(
      kvBefore
    );
    expect(await sql`SELECT * FROM apikey WHERE id = ${keys[0].id}`, 'schema push preserves existing key').toEqual(
      beforePush
    );
    const repairedIdentity = await whoami(server.base, token);
    expect(repairedIdentity.status, 'key after schema push').toBe(200);
    expect((await repairedIdentity.json()).userId).toBe(account.userId);
    expect((await whoami(server.base, browser.key)).status, 'browser key after schema push').toBe(200);
    const afterPushToken = await login(server.base, account.cookie);
    expect((await whoami(server.base, afterPushToken)).status).toBe(200);
    await deleteUser(server.base, account.userId);
    expect(await sql`SELECT id FROM apikey WHERE reference_id = ${account.userId}`).toHaveLength(0);
    expect((await whoami(server.base, token)).status).toBe(401);
    expect((await whoami(server.base, browser.key)).status).toBe(401);
    expect((await whoami(server.base, afterPushToken)).status).toBe(401);
    expect((await post(server.base, `/__test/create-key/${account.userId}`, {})).status).toBe(500);
    expect(await sql`SELECT id FROM apikey WHERE reference_id = ${account.userId}`).toHaveLength(0);
  } finally {
    await cleanup([sql.end({ timeout: 3 }), server.close()]);
  }
}

async function verifyExisting(database: OwnedTestDatabase): Promise<void> {
  await migrate(database);
  const server = await startRegistry(database);
  const sql = postgres(database.url, { max: 1, connect_timeout: 3 });
  try {
    await ensureServiceAccounts(sql);
    const account = await signup(server.base);
    const token = `tank_${randomUUID().replaceAll('-', '')}${randomUUID().replaceAll('-', '')}`;
    const hash = createHash('sha256').update(token).digest('base64url');
    const id = randomUUID();
    await sql`INSERT INTO apikey (id, name, key, user_id, permissions, metadata, created_at, updated_at)
      VALUES (${id}, ${'Legacy key'}, ${hash}, ${account.userId}, ${'{"skills":["read"]}'}, ${'{"origin":"legacy"}'}, NOW(), NOW())`;
    expect((await whoami(server.base, token)).status, 'legacy key before migration').toBe(200);
    const baselineToken = await login(server.base, account.cookie);
    expect((await whoami(server.base, baselineToken)).status, 'new key on NOT NULL schema').toBe(200);
    const other = await signup(server.base);
    const conflict = await sql`SELECT id FROM apikey WHERE reference_id = ${account.userId}`;
    expect(conflict).toHaveLength(1);
    await sql`UPDATE apikey SET reference_id = ${other.userId} WHERE id = ${conflict[0].id}`;
    expect(await verifyPluginKey(server.base, baselineToken), 'migrated conflicting key rejected by Better Auth').toBe(
      false
    );
    const conflictBefore = await sql`SELECT * FROM apikey WHERE id = ${conflict[0].id}`;
    expect((await whoami(server.base, baselineToken)).status, 'migrated conflicting owner fields').toBe(401);
    expect(await sql`SELECT * FROM apikey WHERE id = ${conflict[0].id}`).toEqual(conflictBefore);
    const before =
      await sql`SELECT id, name, key, user_id, reference_id, config_id, permissions, metadata, enabled, expires_at
      FROM apikey WHERE id = ${id}`;
    await migrate(database);
    expect((await whoami(server.base, token)).status, 'legacy key after migration').toBe(200);
    const after =
      await sql`SELECT id, name, key, user_id, reference_id, config_id, permissions, metadata, enabled, expires_at
      FROM apikey WHERE id = ${id}`;
    expect(after).toEqual(before);
    await sql`UPDATE apikey SET reference_id = '' WHERE id = ${id}`;
    expect((await whoami(server.base, token)).status, 'legacy key with empty reference').toBe(200);
    const newToken = await login(server.base, account.cookie);
    const newIdentity = await whoami(server.base, newToken);
    expect(newIdentity.status).toBe(200);
    expect((await newIdentity.json()).userId).toBe(account.userId);
    await deleteUser(server.base, account.userId);
    expect(
      await sql`SELECT id FROM apikey WHERE user_id = ${account.userId} OR reference_id = ${account.userId}`
    ).toHaveLength(0);
    expect((await whoami(server.base, token)).status).toBe(401);
    expect((await whoami(server.base, baselineToken)).status).toBe(401);
    expect((await whoami(server.base, newToken)).status).toBe(401);
  } finally {
    await cleanup([sql.end({ timeout: 3 }), server.close()]);
  }
}

type TestSql = ReturnType<typeof postgres>;

async function seedKey(
  sql: TestSql,
  values: {
    token: string;
    userId: string | null;
    referenceId: string | null;
    permissions?: string | null;
    enabled?: boolean;
    rateLimitMax?: number;
  }
): Promise<string> {
  const id = randomUUID();
  const hash = createHash('sha256').update(values.token).digest('base64url');
  await sql`INSERT INTO apikey
    (id, name, key, user_id, reference_id, config_id, permissions, enabled,
     rate_limit_enabled, rate_limit_time_window, rate_limit_max, request_count, created_at, updated_at)
    VALUES (${id}, 'Seeded key', ${hash}, ${values.userId}, ${values.referenceId}, 'default',
      ${values.permissions ?? null}, ${values.enabled ?? true}, true, 3600000,
      ${values.rateLimitMax ?? 100}, 0, NOW(), NOW())`;
  return id;
}

function newToken(): string {
  return `tank_${randomUUID().replaceAll('-', '')}${randomUUID().replaceAll('-', '')}`;
}

async function withRegistry(
  schema: 'migrated' | 'push-only',
  run: (base: string, sql: TestSql, database: OwnedTestDatabase) => Promise<void>
): Promise<void> {
  await withPrivateEnvironment(async () => {
    const database = await createReadyDatabase(schema === 'push-only');
    let server: Awaited<ReturnType<typeof startRegistry>> | undefined;
    const sql = postgres(database.url, { max: 1, connect_timeout: 3 });
    try {
      if (schema === 'migrated') await migrate(database);
      server = await startRegistry(database);
      await run(server.base, sql, database);
    } finally {
      await cleanup([sql.end({ timeout: 3 }), ...(server ? [server.close()] : [])]);
      await closeOwnedDatabase(database);
    }
  });
}

async function withPushOnlyRegistry(run: (base: string, sql: TestSql) => Promise<void>): Promise<void> {
  await withRegistry('push-only', run);
}

async function withBothRegistries(
  run: (base: string, sql: TestSql, schema: string, database: OwnedTestDatabase) => Promise<void>
): Promise<void> {
  for (const schema of ['migrated', 'push-only'] as const) {
    await withRegistry(schema, async (base, sql, database) => {
      // Existing behavior tests need the service-account schema in both owned fixtures.
      await ensureServiceAccounts(sql);
      await run(base, sql, schema, database);
    });
  }
}

it.skipIf(!enabled || process.platform === 'win32')(
  'does not leak deferred verification state into another raw verification in the same request context',
  async () => {
    await withBothRegistries(async (base, sql, schema) => {
      const owner = await signup(base);
      const other = await signup(base);
      const disputed = newToken();
      const first = await seedKey(sql, { token: disputed, userId: owner.userId, referenceId: owner.userId });
      const second = await seedKey(sql, { token: disputed, userId: other.userId, referenceId: other.userId });
      const before = await sql`SELECT * FROM apikey WHERE id = ANY(${[first, second]}) ORDER BY id`;
      const response = await post(base, '/__test/nested-verification', { invalid: newToken(), disputed });
      expect.soft(response.status).toBe(200);
      expect.soft(await response.json(), `${schema}: disputed raw verification remains invalid`).toEqual({
        failed: true,
        valid: false
      });
      expect.soft(await sql`SELECT * FROM apikey WHERE id = ANY(${[first, second]}) ORDER BY id`).toEqual(before);
    });
  },
  180_000
);

it.skipIf(!enabled || process.platform === 'win32')(
  'isolates simultaneous CLI verifications inside one authentication context',
  async () => {
    await withBothRegistries(async (base, sql, schema) => {
      const first = await signup(base);
      const second = await signup(base);
      const a = await createBrowserKey(base, first.cookie);
      const b = await createBrowserKey(base, second.cookie);
      const before = [a.id, b.id];
      const after = before.map((id) => `after:${id}`);
      await Promise.all([...before, ...after].map((id) => post(base, `/__test/gate/${id}/arm`, {})));
      const pending = post(base, '/__test/concurrent-verifications', { first: a.key, second: b.key });
      try {
        await Promise.all(
          before.map(async (id) => {
            const response = await fetch(`${base}/__test/gate/${id}/wait`, { signal: AbortSignal.timeout(10_000) });
            expect(response.status).toBe(204);
          })
        );
        await Promise.all(before.map((id) => post(base, `/__test/gate/${id}/release`, {})));
        await Promise.all(
          after.map(async (id) => {
            const response = await fetch(`${base}/__test/gate/${id}/wait`, { signal: AbortSignal.timeout(10_000) });
            expect(response.status).toBe(204);
          })
        );
        await Promise.all(after.map((id) => post(base, `/__test/gate/${id}/release`, {})));
        const response = await pending;
        expect.soft(await response.json(), `${schema}: both identities preserved`).toEqual({
          first: first.userId,
          second: second.userId
        });
        const rows = await sql`SELECT id, request_count FROM apikey WHERE id = ANY(${[a.id, b.id]}) ORDER BY id`;
        expect
          .soft(
            rows.map((row) => row.request_count),
            `${schema}: both uses recorded`
          )
          .toEqual([1, 1]);
      } finally {
        await Promise.allSettled([...before, ...after].map((id) => post(base, `/__test/gate/${id}/release`, {})));
        await pending.catch(() => undefined);
      }
    });
  },
  180_000
);

it.skipIf(!enabled || process.platform === 'win32')(
  'inherits parent cancellation for a nested CLI verification',
  async () => {
    await withBothRegistries(async (base, sql, schema) => {
      const owner = await signup(base);
      const key = await createBrowserKey(base, owner.cookie);
      const before = await sql`SELECT * FROM apikey WHERE id = ${key.id}`;
      const response = await post(base, '/__test/cancelled-parent-verification', { key: key.key });
      expect.soft(await response.json(), `${schema}: cancelled parent cannot authenticate`).toEqual({ valid: false });
      expect
        .soft(await sql`SELECT * FROM apikey WHERE id = ${key.id}`, `${schema}: usage remains unchanged`)
        .toEqual(before);
    });
  },
  180_000
);

it.skipIf(!enabled || process.platform === 'win32')(
  'isolates concurrent raw Better Auth permission checks within one request context',
  async () => {
    await withBothRegistries(async (base, sql, schema) => {
      const owner = await signup(base);
      const key = await createBrowserKey(base, owner.cookie);
      await sql`UPDATE apikey SET permissions = ${'{"skills":["admin"]}'} WHERE id = ${key.id}`;
      await post(base, `/__test/gate/${key.id}/arm`, { arrivals: 2 });
      await post(base, '/__test/gate/launch-second/arm', {});
      const pending = post(base, '/__test/raw-verification-pair', { key: key.key });
      try {
        expect(
          (await fetch(`${base}/__test/gate/${key.id}/first`, { signal: AbortSignal.timeout(10_000) })).status
        ).toBe(204);
        expect(
          (await fetch(`${base}/__test/gate/launch-second/wait`, { signal: AbortSignal.timeout(10_000) })).status
        ).toBe(204);
        await sql`UPDATE apikey SET permissions = ${'{"skills":["read"]}'} WHERE id = ${key.id}`;
        await post(base, '/__test/gate/launch-second/release', {});
        expect(
          (await fetch(`${base}/__test/gate/${key.id}/wait`, { signal: AbortSignal.timeout(10_000) })).status
        ).toBe(204);
        await post(base, `/__test/gate/${key.id}/release`, {});
        const response = await pending;
        // The plugin reports its generic adapter-update error for this safe concurrent denial.
        expect
          .soft(await response.json(), `${schema}: stale permission denied`)
          .toEqual({ first: false, firstError: 'FAILED_TO_UPDATE_API_KEY', second: true });
        const [row] = await sql`SELECT request_count, permissions FROM apikey WHERE id = ${key.id}`;
        expect.soft(row.request_count, `${schema}: only valid verification consumed usage`).toBe(1);
        expect.soft(row.permissions).toBe('{"skills":["read"]}');
      } finally {
        await Promise.allSettled([key.id, 'launch-second'].map((id) => post(base, `/__test/gate/${id}/release`, {})));
        await pending.catch(() => undefined);
      }
    });
  },
  180_000
);

it.skipIf(!enabled || process.platform === 'win32')(
  'preserves existing non-default configuration keys accepted by the installed plugin',
  async () => {
    await withBothRegistries(async (base, sql, schema) => {
      const owner = await signup(base);
      const legacyToken = newToken();
      const currentToken = newToken();
      const legacy = await seedKey(sql, { token: legacyToken, userId: owner.userId, referenceId: owner.userId });
      const current = await seedKey(sql, { token: currentToken, userId: owner.userId, referenceId: owner.userId });
      await sql`UPDATE apikey SET config_id = 'historical-configuration' WHERE id = ANY(${[legacy, current]})`;
      const raw = await post(base, '/__test/legacy-verify-key', { key: legacyToken });
      expect.soft(((await raw.json()) as { valid: boolean }).valid, `${schema}: installed plugin`).toBe(true);
      const response = await whoami(base, currentToken);
      expect.soft(response.status, `${schema}: existing user-owned token`).toBe(200);
      if (response.ok) expect.soft((await response.json()).userId).toBe(owner.userId);
      const userOnlyToken = newToken();
      const userOnly = await seedKey(sql, { token: userOnlyToken, userId: owner.userId, referenceId: null });
      await sql`UPDATE apikey SET config_id = 'historical-configuration' WHERE id = ${userOnly}`;
      expect.soft((await whoami(base, userOnlyToken)).status, `${schema}: legacy user ownership`).toBe(200);
      const other = await signup(base);
      const conflictToken = newToken();
      const conflict = await seedKey(sql, { token: conflictToken, userId: owner.userId, referenceId: other.userId });
      await sql`UPDATE apikey SET config_id = 'historical-configuration' WHERE id = ${conflict}`;
      const conflictBefore = await sql`SELECT * FROM apikey WHERE id = ${conflict}`;
      expect.soft((await whoami(base, conflictToken)).status, `${schema}: conflicting owner`).toBe(401);
      expect.soft(await sql`SELECT * FROM apikey WHERE id = ${conflict}`).toEqual(conflictBefore);
      if (schema === 'push-only') {
        const referenceToken = newToken();
        const reference = await seedKey(sql, { token: referenceToken, userId: null, referenceId: owner.userId });
        await sql`UPDATE apikey SET config_id = 'historical-configuration' WHERE id = ${reference}`;
        expect.soft((await whoami(base, referenceToken)).status, 'unknown reference type stays unproven').toBe(401);
      }
    });
  },
  180_000
);

it.skipIf(!enabled || process.platform === 'win32')(
  'preserves a non-default reference-only key when user and organization ownership are indistinguishable',
  async () => {
    await withPushOnlyRegistry(async (base, sql) => {
      const admin = await signupAdmin(base, sql);
      const account = await signup(base);
      await sql`INSERT INTO organization (id, name, slug, created_at)
        VALUES (${account.userId}, 'Overlapping organization', ${randomUUID()}, NOW())`;
      const [service] = await sql`INSERT INTO service_accounts (user_id, owner_user_id, display_name, disabled)
        VALUES (${account.userId}, ${admin.userId}, 'Overlapping service', true) RETURNING id`;
      const token = newToken();
      const key = await seedKey(sql, { token, userId: null, referenceId: account.userId });
      await sql`UPDATE apikey SET config_id = 'organization' WHERE id = ${key}`;
      const before = await sql`SELECT * FROM apikey WHERE id = ${key}`;
      expect.soft((await whoami(base, token)).status, 'ambiguous configuration cannot authenticate').toBe(401);
      expect.soft(await listKeyIds(base, account.cookie), 'ambiguous key not exposed as a user key').not.toContain(key);
      expect.soft((await serviceRequest(base, admin.cookie, 'DELETE', `/${service.id}/keys/${key}`)).status).toBe(404);
      expect.soft(await sql`SELECT * FROM apikey WHERE id = ${key}`, 'ambiguous key not revoked').toEqual(before);

      for (const operation of ['verify', 'cleanup'] as const) {
        const expiredToken = newToken();
        const expired = await seedKey(sql, { token: expiredToken, userId: null, referenceId: account.userId });
        await sql`UPDATE apikey SET config_id = 'organization', expires_at = NOW() - INTERVAL '1 hour'
          WHERE id = ${expired}`;
        const snapshot = await sql`SELECT * FROM apikey WHERE id = ${expired}`;
        if (operation === 'verify') expect(await verifyPluginKey(base, expiredToken)).toBe(false);
        else expect((await post(base, '/__test/cleanup-expired', {})).status).toBe(200);
        expect
          .soft(await sql`SELECT * FROM apikey WHERE id = ${expired}`, `${operation} preserves ambiguity`)
          .toEqual(snapshot);
      }
    });
  },
  120_000
);

it.skipIf(!enabled || process.platform === 'win32')(
  'allows proven user-owned non-default legacy keys to be revoked through browser and server APIs',
  async () => {
    await withBothRegistries(async (base, sql, schema) => {
      const owner = await signup(base);
      for (const route of ['/api/auth/api-key/delete', '/__test/delete-key']) {
        const token = newToken();
        const id = await seedKey(sql, { token, userId: owner.userId, referenceId: owner.userId });
        await sql`UPDATE apikey SET config_id = 'historical-configuration' WHERE id = ${id}`;
        expect.soft((await whoami(base, token)).status, `${schema}: legacy key authenticates`).toBe(200);
        expect.soft(await listKeyIds(base, owner.cookie), `${schema}: legacy key is listed`).toContain(id);
        const wrong = await post(base, route, { keyId: id, configId: 'unrelated-configuration' }, owner.cookie);
        expect.soft(wrong.status, `${schema}: wrong explicit configuration rejected`).toBe(404);
        expect.soft(await sql`SELECT id FROM apikey WHERE id = ${id}`).toHaveLength(1);
        const response = await post(base, route, { keyId: id }, owner.cookie);
        expect.soft(response.status, `${schema}: ${route} revokes the key`).toBe(200);
        expect.soft(await sql`SELECT * FROM apikey WHERE id = ${id}`, `${schema}: key removed`).toHaveLength(0);
        expect.soft((await whoami(base, token)).status, `${schema}: revoked key rejected`).toBe(401);
      }
      const other = await signup(base);
      const token = newToken();
      const first = await seedKey(sql, { token, userId: owner.userId, referenceId: owner.userId });
      const second = await seedKey(sql, { token, userId: other.userId, referenceId: other.userId });
      await sql`UPDATE apikey SET config_id = 'historical-configuration' WHERE id = ANY(${[first, second]})`;
      const before = await sql`SELECT * FROM apikey WHERE id = ANY(${[first, second]}) ORDER BY id`;
      for (const route of ['/api/auth/api-key/delete', '/__test/delete-key']) {
        expect.soft((await post(base, route, { keyId: first }, owner.cookie)).status).toBe(404);
      }
      expect.soft(await sql`SELECT * FROM apikey WHERE id = ANY(${[first, second]}) ORDER BY id`).toEqual(before);
      const racingToken = newToken();
      const racingId = await seedKey(sql, { token: racingToken, userId: owner.userId, referenceId: owner.userId });
      await sql`UPDATE apikey SET config_id = 'historical-configuration' WHERE id = ${racingId}`;
      const gate = `delete:${racingId}`;
      await post(base, `/__test/gate/${gate}/arm`, {});
      const pending = post(base, '/api/auth/api-key/delete', { keyId: racingId }, owner.cookie);
      try {
        expect((await fetch(`${base}/__test/gate/${gate}/wait`, { signal: AbortSignal.timeout(10_000) })).status).toBe(
          204
        );
        const inserted = await seedKey(sql, { token: racingToken, userId: other.userId, referenceId: other.userId });
        const snapshot = await sql`SELECT * FROM apikey WHERE id = ANY(${[racingId, inserted]}) ORDER BY id`;
        await post(base, `/__test/gate/${gate}/release`, {});
        expect.soft((await pending).status, `${schema}: concurrent owner conflict rejected`).toBe(409);
        expect
          .soft(await sql`SELECT * FROM apikey WHERE id = ANY(${[racingId, inserted]}) ORDER BY id`)
          .toEqual(snapshot);
      } finally {
        await post(base, `/__test/gate/${gate}/release`, {}).catch(() => undefined);
        await pending.catch(() => undefined);
      }
    });
  },
  180_000
);

it.skipIf(!enabled || process.platform === 'win32')(
  'does not consume a final key use when service-account status cannot be read',
  async () => {
    await withBothRegistries(async (base, sql, schema) => {
      await ensureServiceAccounts(sql);
      const owner = await signup(base);
      const key = await createBrowserKey(base, owner.cookie);
      await sql`UPDATE apikey SET remaining = 1 WHERE id = ${key.id}`;
      const before = await sql`SELECT * FROM apikey WHERE id = ${key.id}`;
      await sql.unsafe('ALTER TABLE service_accounts RENAME COLUMN disabled TO pr492_disabled');
      try {
        expect.soft((await whoami(base, key.key)).status, `${schema}: retryable read failure`).toBe(503);
        expect
          .soft(await sql`SELECT * FROM apikey WHERE id = ${key.id}`, `${schema}: usage rolled back`)
          .toEqual(before);
      } finally {
        await sql.unsafe('ALTER TABLE service_accounts RENAME COLUMN pr492_disabled TO disabled');
      }
      expect.soft((await whoami(base, key.key)).status, `${schema}: retry can use remaining credential`).toBe(200);
      expect.soft((await whoami(base, key.key)).status, `${schema}: final use was consumed once`).toBe(401);
    });
  },
  180_000
);

it.skipIf(!enabled || process.platform === 'win32')(
  'rolls back a one-use key when a status read fails after the usage update',
  async () => {
    await withBothRegistries(async (base, sql, schema) => {
      await ensureServiceAccounts(sql);
      const owner = await signup(base);
      const key = await createBrowserKey(base, owner.cookie);
      await sql`UPDATE apikey SET remaining = 1 WHERE id = ${key.id}`;
      const before = await sql`SELECT * FROM apikey WHERE id = ${key.id}`;
      await sql.unsafe(`CREATE FUNCTION pr492_break_status_after_usage() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN ALTER TABLE service_accounts RENAME COLUMN disabled TO pr492_disabled; RETURN NEW; END $$`);
      await sql.unsafe(`CREATE TRIGGER pr492_break_status AFTER UPDATE ON apikey FOR EACH ROW
        WHEN (OLD.id = '${key.id}') EXECUTE FUNCTION pr492_break_status_after_usage()`);
      try {
        const response = await whoami(base, key.key);
        expect.soft(response.status, `${schema}: precommit failure is retryable`).toBe(503);
        expect.soft(await response.text()).not.toContain(key.key);
        expect
          .soft(await sql`SELECT * FROM apikey WHERE id = ${key.id}`, `${schema}: usage update rolled back`)
          .toEqual(before);
        expect
          .soft(
            (
              await sql`SELECT column_name FROM information_schema.columns
          WHERE table_name = 'service_accounts' AND column_name = 'disabled'`
            ).length,
            `${schema}: DDL rolled back`
          )
          .toBe(1);
      } finally {
        await sql.unsafe('DROP TRIGGER pr492_break_status ON apikey');
      }
      expect.soft((await whoami(base, key.key)).status, `${schema}: remaining use survives retry`).toBe(200);
      expect.soft((await whoami(base, key.key)).status, `${schema}: no extra uses`).toBe(401);
    });
  },
  180_000
);

it.skipIf(!enabled || process.platform === 'win32')(
  'rolls back a one-use key when an owner profile read fails after the usage update',
  async () => {
    await withBothRegistries(async (base, sql, schema) => {
      const owner = await signup(base);
      const key = await createBrowserKey(base, owner.cookie);
      await sql`UPDATE apikey SET remaining = 1 WHERE id = ${key.id}`;
      const before = await sql`SELECT * FROM apikey WHERE id = ${key.id}`;
      await sql.unsafe(`CREATE FUNCTION pr492_break_owner_after_usage() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN ALTER TABLE "user" RENAME COLUMN name TO pr492_name; RETURN NEW; END $$`);
      await sql.unsafe(`CREATE TRIGGER pr492_break_owner AFTER UPDATE ON apikey FOR EACH ROW
        WHEN (OLD.id = '${key.id}') EXECUTE FUNCTION pr492_break_owner_after_usage()`);
      try {
        const response = await whoami(base, key.key);
        expect.soft(response.status, `${schema}: owner read failure is retryable`).toBe(503);
        expect
          .soft(await sql`SELECT * FROM apikey WHERE id = ${key.id}`, `${schema}: usage rolled back`)
          .toEqual(before);
      } finally {
        await sql.unsafe('DROP TRIGGER pr492_break_owner ON apikey');
        const columns = await sql`SELECT column_name FROM information_schema.columns
          WHERE table_name = 'user' AND column_name = 'pr492_name'`;
        if (columns.length) await sql.unsafe('ALTER TABLE "user" RENAME COLUMN pr492_name TO name');
      }
      expect.soft((await whoami(base, key.key)).status, `${schema}: remaining use survives retry`).toBe(200);
    });
  },
  180_000
);

it.skipIf(!enabled || process.platform === 'win32')(
  'rolls back a one-use key when moderation fails after the usage update on a protected route',
  async () => {
    await withBothRegistries(async (base, sql, schema) => {
      const owner = await signup(base);
      const key = await createBrowserKey(base, owner.cookie);
      await sql`UPDATE apikey SET remaining = 1 WHERE id = ${key.id}`;
      const before = await sql`SELECT * FROM apikey WHERE id = ${key.id}`;
      await sql.unsafe(`CREATE FUNCTION pr492_break_moderation_after_usage() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN ALTER TABLE user_status RENAME COLUMN status TO pr492_status; RETURN NEW; END $$`);
      await sql.unsafe(`CREATE TRIGGER pr492_break_moderation AFTER UPDATE ON apikey FOR EACH ROW
        WHEN (OLD.id = '${key.id}') EXECUTE FUNCTION pr492_break_moderation_after_usage()`);
      try {
        const response = await fetch(`${base}/__test/protected`, { headers: { Authorization: `Bearer ${key.key}` } });
        expect.soft(response.status, `${schema}: moderation failure is retryable`).toBe(503);
        expect.soft(await response.text()).not.toContain(key.key);
        expect
          .soft(await sql`SELECT * FROM apikey WHERE id = ${key.id}`, `${schema}: usage rolled back`)
          .toEqual(before);
      } finally {
        await sql.unsafe('DROP TRIGGER pr492_break_moderation ON apikey');
        const columns = await sql`SELECT column_name FROM information_schema.columns
          WHERE table_name = 'user_status' AND column_name = 'pr492_status'`;
        if (columns.length) await sql.unsafe('ALTER TABLE user_status RENAME COLUMN pr492_status TO status');
      }
      expect.soft((await whoami(base, key.key)).status, `${schema}: remaining use survives retry`).toBe(200);
    });
  },
  180_000
);

it.skipIf(!enabled || process.platform === 'win32')(
  'reports a concurrent disable as a policy denial through the raw verification API',
  async () => {
    await withBothRegistries(async (base, sql, schema) => {
      const owner = await signup(base);
      const key = await createBrowserKey(base, owner.cookie);
      await post(base, `/__test/gate/${key.id}/arm`, {});
      const pending = post(base, '/__test/verify-key', { key: key.key });
      try {
        expect(
          (await fetch(`${base}/__test/gate/${key.id}/wait`, { signal: AbortSignal.timeout(10_000) })).status
        ).toBe(204);
        await sql`UPDATE apikey SET enabled = false WHERE id = ${key.id}`;
        const before = await sql`SELECT * FROM apikey WHERE id = ${key.id}`;
        await post(base, `/__test/gate/${key.id}/release`, {});
        const result = (await (await pending).json()) as { valid: boolean; error: { code: string } };
        expect.soft(result.valid, `${schema}: disabled key rejected`).toBe(false);
        expect.soft(result.error.code, `${schema}: raw plugin policy error`).toBe('KEY_DISABLED');
        expect.soft(await sql`SELECT * FROM apikey WHERE id = ${key.id}`).toEqual(before);
      } finally {
        await post(base, `/__test/gate/${key.id}/release`, {}).catch(() => undefined);
        await pending.catch(() => undefined);
      }
    });
  },
  180_000
);

it.skipIf(!enabled || process.platform === 'win32')(
  'does not treat a renamed service-account relation as proof that no service account exists',
  async () => {
    await withBothRegistries(async (base, sql, schema) => {
      await ensureServiceAccounts(sql);
      const admin = await signupAdmin(base, sql);
      const owner = await signup(base);
      const serviceUser = await signup(base);
      const key = await createBrowserKey(base, serviceUser.cookie);
      await sql`UPDATE apikey SET remaining = 1 WHERE id = ${key.id}`;
      const [service] = await sql`INSERT INTO service_accounts (user_id, owner_user_id, display_name, disabled)
        VALUES (${serviceUser.userId}, ${owner.userId}, 'Renamed service', true) RETURNING id`;
      await sql.unsafe('ALTER TABLE service_accounts RENAME TO pr492_renamed_service_accounts');
      try {
        const constraints = await sql`SELECT conname FROM pg_constraint
          WHERE conrelid = 'pr492_renamed_service_accounts'::regclass AND contype = 'f' ORDER BY conname`;
        expect
          .soft(constraints.length, `${schema}: renamed relation retains user foreign keys`)
          .toBeGreaterThanOrEqual(2);
        const before = await ownerAndKeyState(sql, [owner.userId, serviceUser.userId], [key.id]);
        const serviceBefore = await sql`SELECT * FROM pr492_renamed_service_accounts`;
        await expectSafetyUnavailable(await whoami(base, key.key), key.key, `${schema}: disabled service`);
        await expectSafetyUnavailable(
          await post(base, '/__test/verify-key', { key: key.key }),
          key.key,
          `${schema}: raw API`
        );
        await expectSafetyUnavailable(
          await post(base, '/__test/verify-key-response', { key: key.key }),
          key.key,
          `${schema}: raw response`
        );
        await expectSafetyUnavailable(
          await post(base, '/api/auth/delete-user', { password: 'local-test-password-123' }, owner.cookie),
          key.key,
          `${schema}: browser deletion`
        );
        expect.soft((await deleteUserResponse(base, owner.userId)).status, `${schema}: deletion blocked`).toBe(503);
        await expectSafetyUnavailable(
          await serviceRequest(base, admin.cookie, 'DELETE', `/${service.id}`),
          key.key,
          `${schema}: service deletion`
        );
        expect.soft(await ownerAndKeyState(sql, [owner.userId, serviceUser.userId], [key.id])).toEqual(before);
        expect.soft(await sql`SELECT * FROM pr492_renamed_service_accounts`).toEqual(serviceBefore);
      } finally {
        await sql.unsafe('ALTER TABLE pr492_renamed_service_accounts RENAME TO service_accounts');
      }
      expect.soft((await whoami(base, key.key)).status, `${schema}: disabled service remains rejected`).toBe(401);
      const beforeRaw = await sql`SELECT * FROM apikey WHERE id = ${key.id}`;
      const raw = await post(base, '/__test/verify-key', { key: key.key });
      expect.soft(raw.status, `${schema}: direct verification completes`).toBe(200);
      expect
        .soft(((await raw.json()) as { valid: boolean }).valid, `${schema}: raw API rejects disabled service`)
        .toBe(false);
      expect
        .soft(await sql`SELECT * FROM apikey WHERE id = ${key.id}`, `${schema}: raw denial consumes no use`)
        .toEqual(beforeRaw);
    });
  },
  180_000
);

async function ownerAndKeyState(sql: TestSql, userIds: string[], keyIds: string[]) {
  return {
    users: await sql`SELECT * FROM "user" WHERE id = ANY(${userIds}) ORDER BY id`,
    accounts: await sql`SELECT * FROM account WHERE user_id = ANY(${userIds}) ORDER BY id`,
    sessions: await sql`SELECT * FROM session WHERE user_id = ANY(${userIds}) ORDER BY id`,
    keys: await sql`SELECT * FROM apikey WHERE id = ANY(${keyIds}) ORDER BY id`
  };
}

async function expectSafetyUnavailable(response: Response, token: string, label: string): Promise<void> {
  const body = await response.text();
  expect.soft(response.status, label).toBe(503);
  expect.soft(body, `${label}: actionable message`).toMatch(/administrator/i);
  expect.soft(body, `${label}: no secret`).not.toContain(token);
  expect.soft(body, `${label}: no database details`).not.toMatch(/service_accounts|\b(?:select|alter|drop)\b/i);
}

it.skipIf(!enabled || process.platform === 'win32')(
  'fails closed without consuming a key or deleting an owner when the service-account table is missing',
  async () => {
    await withBothRegistries(async (base, sql, schema) => {
      const owner = await signup(base);
      const key = await createBrowserKey(base, owner.cookie);
      await sql`UPDATE apikey SET remaining = 1 WHERE id = ${key.id}`;
      const before = await ownerAndKeyState(sql, [owner.userId], [key.id]);
      // Simulate an absent relation only in this disposable fixture.
      await sql.unsafe('DROP TABLE service_accounts');
      try {
        for (const response of await authHttpRequests(base, key.key)) {
          await expectSafetyUnavailable(response, key.key, `${schema}: missing table on an authenticated route`);
        }
        await expectSafetyUnavailable(
          await post(base, '/__test/verify-key', { key: key.key }),
          key.key,
          `${schema}: raw API`
        );
        await expectSafetyUnavailable(
          await post(base, '/__test/verify-key-response', { key: key.key }),
          key.key,
          `${schema}: raw response`
        );
        await expectSafetyUnavailable(
          await post(base, '/api/auth/delete-user', { password: 'local-test-password-123' }, owner.cookie),
          key.key,
          `${schema}: browser deletion`
        );
        expect.soft((await deleteUserResponse(base, owner.userId)).status, `${schema}: internal deletion`).toBe(503);
        expect.soft(await ownerAndKeyState(sql, [owner.userId], [key.id])).toEqual(before);
        expect.soft((await whoami(base, newToken())).status, `${schema}: invalid key remains 401`).toBe(401);
      } finally {
        // Test-only restoration; production never auto-creates or repairs the relation.
        await ensureServiceAccounts(sql);
      }
      expect.soft((await whoami(base, key.key)).status, `${schema}: final use remains available`).toBe(200);
      expect.soft((await whoami(base, key.key)).status, `${schema}: final use consumed once`).toBe(401);
      await deleteUser(base, owner.userId);
    });
  },
  180_000
);

async function measureVerification(
  base: string,
  token: string,
  concurrency: number,
  alternate?: { base: string; token: string }
) {
  const latencies: number[] = [];
  const statuses: number[] = [];
  let next = 0;
  const total = 120;
  const started = performance.now();
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (next < total) {
        const index = next++;
        const before = performance.now();
        const selected = alternate && index % 2 ? alternate : { base, token };
        const response = await whoami(selected.base, selected.token);
        statuses.push(response.status);
        await response.body?.cancel();
        latencies.push(performance.now() - before);
      }
    })
  );
  const elapsed = performance.now() - started;
  latencies.sort((a, b) => a - b);
  return {
    concurrency,
    requests: total,
    errors: statuses.filter((status) => status !== 200).length,
    requestsPerSecond: Math.round((total * 1000) / elapsed),
    p50Ms: Math.round(latencies[Math.ceil(total * 0.5) - 1] * 100) / 100,
    p95Ms: Math.round(latencies[Math.ceil(total * 0.95) - 1] * 100) / 100
  };
}

it.skipIf(!enabled || process.platform === 'win32' || process.env.E2E_APIKEY_BENCHMARK !== '1')(
  'measures local API-key verification latency and concurrency',
  async () => {
    await withPushOnlyRegistry(async (base, sql) => {
      const account = await signup(base);
      const key = await createBrowserKey(base, account.cookie);
      await sql`UPDATE apikey SET rate_limit_max = 10000 WHERE id = ${key.id}`;
      for (let i = 0; i < 10; i++) expect((await whoami(base, key.key)).status).toBe(200);
      for (const concurrency of [1, 8, 32]) {
        const before = await sql`SELECT request_count FROM apikey WHERE id = ${key.id}`;
        const result = await measureVerification(base, key.key, concurrency);
        const after = await sql`SELECT request_count FROM apikey WHERE id = ${key.id}`;
        expect(result.errors).toBe(0);
        process.stdout.write(
          `API_KEY_BENCHMARK ${JSON.stringify({ ...result, recordedRequests: after[0].request_count - before[0].request_count })}\n`
        );
      }
    });
  },
  120_000
);

it.skipIf(!enabled || process.platform === 'win32' || process.env.E2E_APIKEY_BENCHMARK !== '1')(
  'measures cross-instance API-key contention for independent keys',
  async () => {
    await withRegistry('push-only', async (base, sql, database) => {
      const other = await startRegistry(database);
      try {
        const firstUser = await signup(base);
        const secondUser = await signup(other.base);
        const first = await createBrowserKey(base, firstUser.cookie);
        const second = await createBrowserKey(other.base, secondUser.cookie);
        await sql`UPDATE apikey SET rate_limit_max = 10000 WHERE id = ANY(${[first.id, second.id]})`;
        for (let i = 0; i < 10; i++) {
          expect((await whoami(base, first.key)).status).toBe(200);
          expect((await whoami(other.base, second.key)).status).toBe(200);
        }
        for (const concurrency of [1, 8, 32]) {
          const result = await measureVerification(base, first.key, concurrency, {
            base: other.base,
            token: second.key
          });
          expect(result.errors).toBe(0);
          process.stdout.write(`API_KEY_CROSS_INSTANCE_BENCHMARK ${JSON.stringify(result)}\n`);
        }
      } finally {
        await other.close();
      }
    });
  },
  120_000
);

it.skipIf(!enabled || process.platform === 'win32' || process.env.E2E_APIKEY_BENCHMARK !== '1')(
  'measures session contention with and without unrelated API-key verification',
  async () => {
    await withPushOnlyRegistry(async (base, sql) => {
      const sessionUser = await signup(base);
      const keyUser = await signup(base);
      const key = await createBrowserKey(base, keyUser.cookie);
      await sql`UPDATE apikey SET rate_limit_max = 10000 WHERE id = ${key.id}`;
      const sessionProbe = await fetch(`${base}/api/auth/get-session`, {
        headers: { Cookie: sessionUser.cookie, Origin: base }
      });
      expect(sessionProbe.status).toBe(200);
      expect(((await sessionProbe.json()) as { user: { id: string } }).user.id).toBe(sessionUser.userId);
      for (const mixed of [false, true]) {
        const sessionTimes: number[] = [];
        const keyTimes: number[] = [];
        const statuses: number[] = [];
        let next = 0;
        const start = performance.now();
        await Promise.all(
          Array.from({ length: 32 }, async () => {
            while (next < 120) {
              const index = next++;
              const isKey = mixed && index % 2 === 1;
              const before = performance.now();
              const response = isKey
                ? await whoami(base, key.key)
                : await fetch(`${base}/api/auth/get-session`, {
                    headers: { Cookie: sessionUser.cookie, Origin: base }
                  });
              statuses.push(response.status);
              await response.body?.cancel();
              (isKey ? keyTimes : sessionTimes).push(performance.now() - before);
            }
          })
        );
        sessionTimes.sort((a, b) => a - b);
        keyTimes.sort((a, b) => a - b);
        const p95 = (values: number[]) =>
          values.length ? Math.round(values[Math.ceil(values.length * 0.95) - 1] * 100) / 100 : null;
        expect(statuses.filter((status) => status !== 200)).toHaveLength(0);
        process.stdout.write(
          `API_KEY_SESSION_BENCHMARK ${JSON.stringify({
            mixed,
            concurrency: 32,
            requests: statuses.length,
            sessionRequests: sessionTimes.length,
            keyRequests: keyTimes.length,
            elapsedMs: Math.round(performance.now() - start),
            sessionP95Ms: p95(sessionTimes),
            keyP95Ms: p95(keyTimes)
          })}\n`
        );
      }
    });
  },
  120_000
);

async function listKeyIds(base: string, cookie: string): Promise<string[]> {
  const response = await fetch(`${base}/api/auth/api-key/list`, { headers: { Cookie: cookie, Origin: base } });
  expect(response.status, 'browser key list').toBe(200);
  const body = (await response.json()) as { apiKeys: Array<{ id: string; key?: unknown }> };
  expect(
    body.apiKeys.every((key) => key.key === undefined),
    'list does not expose hashes'
  ).toBe(true);
  return body.apiKeys.map((key) => key.id);
}

async function getKey(base: string, cookie: string, id: string): Promise<Response> {
  return fetch(`${base}/api/auth/api-key/get?id=${encodeURIComponent(id)}`, {
    headers: { Cookie: cookie, Origin: base }
  });
}

it.skipIf(!enabled || process.platform === 'win32')(
  'rejects duplicate hashes with different owners or policies without disabling equivalent duplicates',
  async () => {
    await withBothRegistries(async (base, sql, schema) => {
      const first = await signup(base);
      const second = await signup(base);
      for (const mismatch of ['owner', 'scope', 'enabled', 'expiry', 'rate', 'remaining'] as const) {
        const token = newToken();
        const permissions = '{"skills":["read"]}';
        await seedKey(sql, { token, userId: first.userId, referenceId: first.userId, permissions });
        const otherId = await seedKey(sql, {
          token,
          userId: mismatch === 'owner' ? second.userId : first.userId,
          referenceId: mismatch === 'owner' ? second.userId : first.userId,
          permissions: mismatch === 'scope' ? '{"skills":["admin"]}' : permissions,
          enabled: mismatch !== 'enabled'
        });
        if (mismatch === 'expiry')
          await sql`UPDATE apikey SET expires_at = NOW() + INTERVAL '1 day' WHERE id = ${otherId}`;
        if (mismatch === 'rate') await sql`UPDATE apikey SET rate_limit_max = 2 WHERE id = ${otherId}`;
        if (mismatch === 'remaining') await sql`UPDATE apikey SET remaining = 3 WHERE id = ${otherId}`;
        const hash = createHash('sha256').update(token).digest('base64url');
        const before = await sql`SELECT * FROM apikey WHERE key = ${hash} ORDER BY id`;
        expect.soft((await whoami(base, token)).status, `${schema}: duplicate ${mismatch}`).toBe(401);
        expect
          .soft(await sql`SELECT * FROM apikey WHERE key = ${hash} ORDER BY id`, `${schema}: unchanged ${mismatch}`)
          .toEqual(before);
      }
      const equivalent = newToken();
      await seedKey(sql, { token: equivalent, userId: first.userId, referenceId: first.userId, rateLimitMax: 2 });
      await seedKey(sql, { token: equivalent, userId: first.userId, referenceId: first.userId, rateLimitMax: 2 });
      const statuses = [];
      for (let i = 0; i < 3; i++) statuses.push((await whoami(base, equivalent)).status);
      expect.soft(statuses, `${schema}: equivalent duplicates share the existing rate limit`).toEqual([200, 200, 401]);
    });
  },
  180_000
);

it.skipIf(!enabled || process.platform === 'win32')(
  'treats API-key hashes as byte-exact even under a nondeterministic database collation',
  async () => {
    await withBothRegistries(async (base, sql, schema) => {
      await sql.unsafe(
        "CREATE COLLATION pr492_hash_ci (provider = icu, locale = 'und-u-ks-level2', deterministic = false)"
      );
      await sql.unsafe('ALTER TABLE apikey ALTER COLUMN key TYPE text COLLATE pr492_hash_ci');
      const owner = await signup(base);
      const other = await signup(base);
      const token = newToken();
      const hash = createHash('sha256').update(token).digest('base64url');
      const alternate = hash.replace(/[a-zA-Z]/, (character) =>
        character === character.toLowerCase() ? character.toUpperCase() : character.toLowerCase()
      );
      const otherId = await seedKey(sql, { token, userId: other.userId, referenceId: other.userId });
      await sql`UPDATE apikey SET key = ${alternate} WHERE id = ${otherId}`;
      const before = await sql`SELECT * FROM apikey WHERE id = ${otherId}`;
      expect.soft(await verifyPluginKey(base, token), `${schema}: case-folded hash is not the key`).toBe(false);
      expect.soft((await whoami(base, token)).status).toBe(401);
      expect
        .soft(await sql`SELECT * FROM apikey WHERE id = ${otherId}`, `${schema}: other key untouched`)
        .toEqual(before);
      const ownerId = await seedKey(sql, { token, userId: owner.userId, referenceId: owner.userId });
      expect.soft(await verifyPluginKey(base, token), `${schema}: exact key remains usable`).toBe(true);
      expect.soft((await whoami(base, token)).status, `${schema}: exact key identifies its owner`).toBe(200);
      expect.soft((await post(base, '/api/auth/api-key/delete', { keyId: ownerId }, owner.cookie)).status).toBe(200);
      expect.soft(await sql`SELECT id FROM apikey WHERE id = ${ownerId}`).toHaveLength(0);
      expect
        .soft(await sql`SELECT * FROM apikey WHERE id = ${otherId}`, `${schema}: revocation leaves other key`)
        .toEqual(before);
      const secondToken = newToken();
      const secondHash = createHash('sha256').update(secondToken).digest('base64url');
      const caseVariant = secondHash.replace(/[a-zA-Z]/, (character) =>
        character === character.toLowerCase() ? character.toUpperCase() : character.toLowerCase()
      );
      const exact = await seedKey(sql, { token: secondToken, userId: owner.userId, referenceId: owner.userId });
      const distinct = await seedKey(sql, { token: secondToken, userId: owner.userId, referenceId: owner.userId });
      await sql`UPDATE apikey SET key = ${caseVariant} WHERE id = ${distinct}`;
      const distinctBefore = await sql`SELECT * FROM apikey WHERE id = ${distinct}`;
      expect.soft((await post(base, '/api/auth/api-key/delete', { keyId: exact }, owner.cookie)).status).toBe(200);
      expect
        .soft(await sql`SELECT * FROM apikey WHERE id = ${distinct}`, `${schema}: distinct same-owner key survives`)
        .toEqual(distinctBefore);
    });
  },
  180_000
);

it.skipIf(!enabled || process.platform === 'win32')(
  'keeps unambiguous legacy keys manageable but hides disputed keys from both browser owners',
  async () => {
    await withBothRegistries(async (base, sql, schema) => {
      const first = await signup(base);
      const second = await signup(base);
      const legacy = await seedKey(sql, { token: newToken(), userId: first.userId, referenceId: null });
      const referenceOnly =
        schema === 'push-only'
          ? await seedKey(sql, { token: newToken(), userId: null, referenceId: first.userId })
          : null;
      const valid = await createBrowserKey(base, first.cookie);
      const conflictIds: string[] = [];
      for (let i = 0; i < 6; i++) {
        conflictIds.push(await seedKey(sql, { token: newToken(), userId: first.userId, referenceId: second.userId }));
      }
      const beforeLists = await sql`SELECT * FROM apikey
        WHERE user_id = ${first.userId} AND reference_id = ${second.userId} ORDER BY id`;
      const firstList = await listKeyIds(base, first.cookie);
      const secondList = await listKeyIds(base, second.cookie);
      expect.soft(firstList, `${schema}: owner sees legacy`).toContain(legacy);
      expect.soft(firstList, 'owner sees matching').toContain(valid.id);
      expect
        .soft(
          firstList.some((id) => conflictIds.includes(id)),
          'first owner cannot list conflicts'
        )
        .toBe(false);
      expect
        .soft(
          secondList.some((id) => conflictIds.includes(id)),
          'second owner cannot list conflicts'
        )
        .toBe(false);
      expect
        .soft(
          await sql`SELECT * FROM apikey WHERE user_id = ${first.userId} AND reference_id = ${second.userId} ORDER BY id`
        )
        .toEqual(beforeLists);
      expect.soft((await getKey(base, first.cookie, legacy)).status, 'owner gets legacy').toBe(200);
      expect.soft((await getKey(base, second.cookie, legacy)).status, 'other user cannot get legacy').toBe(404);
      expect.soft((await getKey(base, first.cookie, valid.id)).status, 'owner gets matching').toBe(200);
      expect.soft((await post(base, '/api/auth/api-key/delete', { keyId: legacy }, second.cookie)).status).toBe(404);
      expect
        .soft(await sql`SELECT id FROM apikey WHERE id = ${legacy}`, 'other user cannot revoke legacy')
        .toHaveLength(1);
      const changed = await post(
        base,
        '/api/auth/api-key/update',
        { keyId: legacy, name: 'Renamed legacy' },
        first.cookie
      );
      expect.soft(changed.status, 'owner updates legacy').toBe(200);
      const removed = await post(base, '/api/auth/api-key/delete', { keyId: legacy }, first.cookie);
      expect.soft(removed.status, 'owner revokes legacy').toBe(200);
      expect.soft(await sql`SELECT id FROM apikey WHERE id = ${legacy}`, 'legacy revoked').toHaveLength(0);
      expect
        .soft(
          (await post(base, '/api/auth/api-key/update', { keyId: valid.id, name: 'Renamed matching' }, first.cookie))
            .status
        )
        .toBe(200);
      expect.soft((await post(base, '/api/auth/api-key/delete', { keyId: valid.id }, first.cookie)).status).toBe(200);
      expect.soft(await sql`SELECT id FROM apikey WHERE id = ${valid.id}`, 'matching key revoked').toHaveLength(0);
      if (referenceOnly) {
        expect.soft(firstList, 'owner sees reference-only key').toContain(referenceOnly);
        expect.soft((await getKey(base, first.cookie, referenceOnly)).status).toBe(200);
        expect
          .soft(
            (
              await post(
                base,
                '/api/auth/api-key/update',
                { keyId: referenceOnly, name: 'Renamed reference' },
                first.cookie
              )
            ).status
          )
          .toBe(200);
        expect
          .soft((await post(base, '/api/auth/api-key/delete', { keyId: referenceOnly }, first.cookie)).status)
          .toBe(200);
        expect
          .soft(await sql`SELECT id FROM apikey WHERE id = ${referenceOnly}`, 'reference-only key revoked')
          .toHaveLength(0);
      }

      let index = 0;
      for (const cookie of [first.cookie, second.cookie]) {
        for (const operation of ['get', 'update', 'delete'] as const) {
          const id = conflictIds[index++];
          const before = await sql`SELECT * FROM apikey WHERE id = ${id}`;
          const response =
            operation === 'get'
              ? await getKey(base, cookie, id)
              : await post(base, `/api/auth/api-key/${operation}`, { keyId: id, name: 'Changed' }, cookie);
          expect.soft(response.status, `disputed ${operation}`).toBe(404);
          expect
            .soft(await sql`SELECT * FROM apikey WHERE id = ${id}`, `disputed ${operation} unchanged`)
            .toEqual(before);
        }
      }
    });
  },
  180_000
);

it.skipIf(!enabled || process.platform === 'win32')(
  'does not overwrite concurrent key disables, owner conflicts, or permission changes during verification',
  async () => {
    await withBothRegistries(async (base, sql) => {
      const account = await signup(base);
      const other = await signup(base);
      for (const mutation of ['disable', 'owner', 'permissions'] as const) {
        const key = await createBrowserKey(base, account.cookie);
        await sql`UPDATE apikey SET permissions = ${'{"skills":["admin"]}'} WHERE id = ${key.id}`;
        expect((await post(base, `/__test/gate/${key.id}/arm`, {})).status).toBe(204);
        const pending = fetch(`${base}/__test/scopes`, {
          headers: { Authorization: `Bearer ${key.key}` },
          signal: AbortSignal.timeout(20_000)
        });
        try {
          const entered = await fetch(`${base}/__test/gate/${key.id}/wait`, { signal: AbortSignal.timeout(10_000) });
          expect(entered.status, `entered verification for ${mutation}`).toBe(204);
          if (mutation === 'disable') await sql`UPDATE apikey SET enabled = false WHERE id = ${key.id}`;
          if (mutation === 'owner') await sql`UPDATE apikey SET reference_id = ${other.userId} WHERE id = ${key.id}`;
          if (mutation === 'permissions') {
            await sql`UPDATE apikey SET permissions = ${'{"skills":["read"]}'} WHERE id = ${key.id}`;
          }
          const before = await sql`SELECT enabled, user_id, reference_id, permissions FROM apikey WHERE id = ${key.id}`;
          expect((await post(base, `/__test/gate/${key.id}/release`, {})).status).toBe(204);
          const response = await pending;
          expect.soft(response.status, `${mutation} race must not authenticate stale data`).toBe(401);
          expect
            .soft(await sql`SELECT enabled, user_id, reference_id, permissions FROM apikey WHERE id = ${key.id}`)
            .toEqual(before);
          const current = await fetch(`${base}/__test/scopes`, { headers: { Authorization: `Bearer ${key.key}` } });
          if (mutation === 'permissions') {
            expect.soft(current.status).toBe(200);
            if (current.status === 200) expect.soft(await current.json()).toEqual({ scopes: ['skills:read'] });
          } else expect.soft(current.status, `current ${mutation} must not authenticate`).toBe(401);
        } finally {
          await post(base, `/__test/gate/${key.id}/release`, {}).catch(() => undefined);
          await pending.catch(() => undefined);
        }
      }
    });
  },
  180_000
);

it.skipIf(!enabled || process.platform === 'win32')(
  'does not lose rate-limit accounting under simultaneous verification',
  async () => {
    await withPushOnlyRegistry(async (base, sql) => {
      const account = await signup(base);
      const key = await createBrowserKey(base, account.cookie);
      await sql`UPDATE apikey SET rate_limit_max = 2 WHERE id = ${key.id}`;
      const parallel = 5;
      expect((await post(base, `/__test/gate/${key.id}/arm`, { arrivals: parallel })).status).toBe(204);
      const pending = Array.from({ length: parallel }, () =>
        fetch(`${base}/__test/scopes`, {
          headers: { Authorization: `Bearer ${key.key}` },
          signal: AbortSignal.timeout(20_000)
        })
      );
      try {
        const entered = await fetch(`${base}/__test/gate/${key.id}/wait`, { signal: AbortSignal.timeout(10_000) });
        expect(entered.status, 'all verifications read before any update').toBe(204);
        expect((await post(base, `/__test/gate/${key.id}/release`, {})).status).toBe(204);
        const statuses = (await Promise.all(pending)).map((response) => response.status);
        const successes = statuses.filter((status) => status === 200).length;
        const rows = await sql`SELECT request_count FROM apikey WHERE id = ${key.id}`;
        expect.soft(successes, 'at least one legitimate request succeeds').toBeGreaterThanOrEqual(1);
        expect.soft(successes, 'no more requests succeed than the rate limit').toBeLessThanOrEqual(2);
        expect.soft(rows[0].request_count, 'every successful request is accounted for').toBe(successes);
      } finally {
        await post(base, `/__test/gate/${key.id}/release`, {}).catch(() => undefined);
        await Promise.allSettled(pending);
      }
    });
  },
  120_000
);

it.skipIf(!enabled || process.platform === 'win32')(
  'documents accepted risk: independently used duplicate keys can exceed rate and finite-use limits',
  async () => {
    await withBothRegistries(async (base, sql, schema) => {
      const account = await signup(base);
      for (const limit of ['rate', 'finite-use'] as const) {
        const token = newToken();
        const first = await seedKey(sql, {
          token,
          userId: account.userId,
          referenceId: account.userId,
          rateLimitMax: limit === 'rate' ? 2 : 100
        });
        const second = await seedKey(sql, {
          token,
          userId: account.userId,
          referenceId: account.userId,
          rateLimitMax: limit === 'rate' ? 2 : 100
        });
        if (limit === 'finite-use') await sql`UPDATE apikey SET remaining = 2 WHERE id = ANY(${[first, second]})`;
        const hash = createHash('sha256').update(token).digest('base64url');
        const parked = `parked-${randomUUID()}`;
        await sql`UPDATE apikey SET key = ${parked} WHERE id = ${second}`;
        const firstUse = await post(base, '/__test/legacy-verify-key', { key: token });
        expect(firstUse.status).toBe(200);
        expect((await firstUse.json()).valid).toBe(true);
        await sql`UPDATE apikey SET key = ${parked} WHERE id = ${first}`;
        await sql`UPDATE apikey SET key = ${hash} WHERE id = ${second}`;
        const secondUse = await post(base, '/__test/legacy-verify-key', { key: token });
        expect(secondUse.status).toBe(200);
        expect((await secondUse.json()).valid).toBe(true);
        await sql`UPDATE apikey SET key = ${hash} WHERE id = ${first}`;
        const before = await sql`SELECT * FROM apikey WHERE key = ${hash} ORDER BY id`;
        expect(before.map((key) => key.request_count)).toEqual([1, 1]);
        if (limit === 'finite-use') expect(before.map((key) => key.remaining)).toEqual([1, 1]);
        // Accepted limitation, not a security guarantee: historical independent uses are
        // indistinguishable from one synchronized use, so the maximum counter permits one more.
        expect.soft((await whoami(base, token)).status, `${schema}: extra request is accepted`).toBe(200);
        const after = await sql`SELECT * FROM apikey WHERE key = ${hash} ORDER BY id`;
        expect
          .soft(
            after.map((key) => key.request_count),
            `${schema}: both counters synchronize`
          )
          .toEqual([2, 2]);
        if (limit === 'finite-use') expect(after.map((key) => key.remaining)).toEqual([0, 0]);
        expect.soft((await whoami(base, token)).status, `${schema}: synchronized limit then applies`).toBe(401);
      }
    });
  },
  180_000
);

it.skipIf(!enabled || process.platform === 'win32')(
  'returns sanitized retryable errors for real database failures while rejecting invalid and disabled keys',
  async () => {
    await withBothRegistries(async (base, sql, schema) => {
      await ensureServiceAccounts(sql);
      const owner = await signup(base);
      const key = await createBrowserKey(base, owner.cookie);
      const disabled = await createBrowserKey(base, owner.cookie);
      await sql`UPDATE apikey SET enabled = false WHERE id = ${disabled.id}`;
      expect((await whoami(base, newToken())).status).toBe(401);
      expect((await whoami(base, disabled.key)).status).toBe(401);
      await sql.unsafe(
        "CREATE FUNCTION pr492_fail_verification() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'pr492-private-database-detail'; END $$"
      );
      await sql.unsafe(
        `CREATE TRIGGER pr492_fail_verification BEFORE UPDATE ON apikey FOR EACH ROW WHEN (OLD.id = '${key.id}') EXECUTE FUNCTION pr492_fail_verification()`
      );
      try {
        for (const response of await authHttpRequests(base, key.key)) {
          expect.soft(response.status, `${schema}: verification write failure`).toBe(503);
          const body = await response.text();
          expect.soft(body).not.toContain(key.key);
          expect.soft(body).not.toContain('pr492-private-database-detail');
        }
      } finally {
        await sql.unsafe('DROP TRIGGER pr492_fail_verification ON apikey');
      }
      await sql.unsafe('ALTER TABLE apikey RENAME TO pr492_unavailable_apikey');
      try {
        for (const response of await authHttpRequests(base, key.key)) {
          expect.soft(response.status, `${schema}: initial lookup failure`).toBe(503);
          expect.soft(await response.text()).not.toContain(key.key);
        }
      } finally {
        await sql.unsafe('ALTER TABLE pr492_unavailable_apikey RENAME TO apikey');
      }
      await sql.unsafe('ALTER TABLE service_accounts RENAME COLUMN disabled TO pr492_disabled');
      try {
        for (const response of await authHttpRequests(base, key.key)) {
          expect.soft(response.status, `${schema}: service-account status failure`).toBe(503);
          expect.soft(await response.text()).not.toContain(key.key);
        }
      } finally {
        await sql.unsafe('ALTER TABLE service_accounts RENAME COLUMN pr492_disabled TO disabled');
      }
      expect((await whoami(base, key.key)).status, `${schema}: authentication recovers`).toBe(200);
    });
  },
  180_000
);

it.skipIf(!enabled || process.platform === 'win32')(
  'bounds authentication waiting for a busy single-connection pool and never writes after a timeout',
  async () => {
    await withBothRegistries(async (base, sql, schema) => {
      const owner = await signup(base);
      const key = await createBrowserKey(base, owner.cookie);
      const before = await sql`SELECT * FROM apikey WHERE id = ${key.id}`;
      const hold = post(base, '/__test/hold-pool', {});
      try {
        await waitForHeldPool(sql);
        const started = performance.now();
        const responses = await authHttpRequests(base, key.key);
        const elapsed = performance.now() - started;
        expect
          .soft(
            responses.map((response) => response.status),
            `${schema}: retryable timeout`
          )
          .toEqual([503, 503, 503, 503]);
        expect.soft(elapsed, `${schema}: bounded queue wait`).toBeLessThan(6_500);
        for (const response of responses) expect.soft(await response.text()).not.toContain(key.key);
        expect((await hold).status).toBe(204);
        expect.soft(await sql`SELECT * FROM apikey WHERE id = ${key.id}`, `${schema}: no late writes`).toEqual(before);
      } finally {
        await hold.catch(() => undefined);
      }
    });
  },
  180_000
);

it.skipIf(!enabled || process.platform === 'win32')(
  'bounds queued authentication reads and recovers after abandoned requests',
  async () => {
    await withBothRegistries(async (base, sql, schema) => {
      const owner = await signup(base);
      const key = await createBrowserKey(base, owner.cookie);
      const before = await sql`SELECT * FROM apikey WHERE id = ${key.id}`;
      const hold = post(base, '/__test/hold-pool', {});
      try {
        await waitForHeldPool(sql);
        let rejectedEarly = 0;
        const controllers = Array.from({ length: 96 }, () => new AbortController());
        const requests = controllers.map((controller) =>
          fetch(`${base}/api/v1/auth/whoami`, {
            headers: { Authorization: `Bearer ${key.key}` },
            signal: controller.signal
          }).then((response) => {
            if (response.status === 503) rejectedEarly++;
            return response.status;
          })
        );
        for (const request of requests) void request.catch(() => undefined);
        await new Promise((resolve) => setTimeout(resolve, 1_500));
        expect.soft(rejectedEarly, `${schema}: bounded admission rejects overload promptly`).toBeGreaterThanOrEqual(16);
        for (const controller of controllers.slice(0, 32)) controller.abort();
        const outcomes = await Promise.allSettled(requests);
        expect
          .soft(outcomes.slice(32).every((result) => result.status === 'fulfilled' && result.value === 503))
          .toBe(true);
        expect((await hold).status).toBe(204);
        const drained = await fetch(`${base}/api/auth/get-session`, {
          headers: { Cookie: owner.cookie, Origin: base }
        });
        expect(drained.status).toBe(200);
        expect
          .soft(await sql`SELECT * FROM apikey WHERE id = ${key.id}`, `${schema}: no abandoned request wrote usage`)
          .toEqual(before);
        expect.soft((await whoami(base, key.key)).status, `${schema}: verification recovers`).toBe(200);
      } finally {
        await hold.catch(() => undefined);
      }
    });
  },
  180_000
);

it.skipIf(!enabled || process.platform === 'win32')(
  'bounds the owner recheck before consuming usage without issuing any later write',
  async () => {
    await withBothRegistries(async (base, sql, schema) => {
      const owner = await signup(base);
      const key = await createBrowserKey(base, owner.cookie);
      const gate = `after:${key.id}`;
      expect((await post(base, `/__test/gate/${gate}/arm`, {})).status).toBe(204);
      const verification = whoami(base, key.key);
      let hold: Promise<Response> | undefined;
      try {
        expect((await fetch(`${base}/__test/gate/${gate}/wait`, { signal: AbortSignal.timeout(10_000) })).status).toBe(
          204
        );
        const afterVerification = await sql`SELECT * FROM apikey WHERE id = ${key.id}`;
        expect(afterVerification[0].request_count).toBe(0);
        hold = post(base, '/__test/hold-pool', {});
        await waitForHeldPool(sql);
        const start = performance.now();
        await post(base, `/__test/gate/${gate}/release`, {});
        expect((await verification).status, `${schema}: owner recheck times out`).toBe(503);
        expect(performance.now() - start).toBeLessThan(6_500);
        expect((await hold).status).toBe(204);
        expect(await sql`SELECT * FROM apikey WHERE id = ${key.id}`, `${schema}: no write after timeout`).toEqual(
          afterVerification
        );
      } finally {
        await post(base, `/__test/gate/${gate}/release`, {}).catch(() => undefined);
        await hold?.catch(() => undefined);
        await verification.catch(() => undefined);
      }
    });
  },
  180_000
);

it.skipIf(!enabled || process.platform === 'win32')(
  'does not mutate API-key usage after a caller abandons a queued authentication',
  async () => {
    await withBothRegistries(async (base, sql, schema) => {
      const owner = await signup(base);
      const key = await createBrowserKey(base, owner.cookie);
      const before = await sql`SELECT * FROM apikey WHERE id = ${key.id}`;
      const hold = post(base, '/__test/hold-pool-short', {});
      try {
        await waitForHeldPool(sql, 'SELECT pg_sleep(2)');
        const request = fetch(`${base}/api/v1/auth/whoami`, {
          headers: { Authorization: `Bearer ${key.key}` },
          signal: AbortSignal.timeout(500)
        });
        await expect(request).rejects.toThrow();
        expect((await hold).status).toBe(204);
        const deadline = Date.now() + 1_500;
        let after = await sql`SELECT * FROM apikey WHERE id = ${key.id}`;
        while (Date.now() < deadline && after[0]?.request_count === before[0].request_count) {
          await new Promise((resolve) => setTimeout(resolve, 20));
          after = await sql`SELECT * FROM apikey WHERE id = ${key.id}`;
        }
        expect(after, `${schema}: caller timeout did not mutate usage later`).toEqual(before);
      } finally {
        await hold.catch(() => undefined);
      }
    });
  },
  180_000
);

it.skipIf(!enabled || process.platform === 'win32')(
  'does not enter a protected mutation after the caller disconnects during the final moderation read',
  async () => {
    await withBothRegistries(async (base, sql, schema) => {
      const owner = await signup(base);
      const key = await createBrowserKey(base, owner.cookie);
      await sql`INSERT INTO user_status (user_id, status) VALUES (${owner.userId}, 'active')`;
      await sql.unsafe('CREATE TABLE pr492_protected_writes (id integer NOT NULL)');
      await sql.unsafe('CREATE SEQUENCE pr492_moderation_reads');
      await sql.unsafe(`CREATE FUNCTION pr492_delay_moderation_read() RETURNS boolean LANGUAGE plpgsql VOLATILE AS $$
        BEGIN IF nextval('pr492_moderation_reads') = 1 THEN PERFORM pg_sleep(4); END IF; RETURN true; END $$`);
      await sql.unsafe('ALTER TABLE user_status RENAME TO pr492_user_status');
      await sql.unsafe(
        'CREATE VIEW user_status AS SELECT * FROM pr492_user_status WHERE pr492_delay_moderation_read()'
      );
      const request = fetch(`${base}/__test/protected`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key.key}` },
        signal: AbortSignal.timeout(2_000)
      });
      void request.catch(() => undefined);
      const deadline = Date.now() + 7_000;
      let sleeping = false;
      while (Date.now() < deadline) {
        const [row] = await sql`SELECT COUNT(*)::int AS count FROM pg_stat_activity
          WHERE pid <> pg_backend_pid() AND wait_event = 'PgSleep' AND datname = current_database()`;
        if (row.count) {
          sleeping = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      expect(sleeping, `${schema}: final moderation read entered`).toBe(true);
      await expect(request).rejects.toThrow();
      while (Date.now() < deadline) {
        const [row] = await sql`SELECT COUNT(*)::int AS count FROM pg_stat_activity
          WHERE pid <> pg_backend_pid() AND wait_event = 'PgSleep' AND datname = current_database()`;
        if (!row.count) break;
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      const settle = Date.now() + 1_000;
      let writes = await sql`SELECT id FROM pr492_protected_writes`;
      while (Date.now() < settle && !writes.length) {
        await new Promise((resolve) => setTimeout(resolve, 20));
        writes = await sql`SELECT id FROM pr492_protected_writes`;
      }
      expect(writes, `${schema}: protected mutation was not entered`).toHaveLength(0);
    });
  },
  180_000
);

it.skipIf(!enabled || process.platform === 'win32')(
  'does not write a verification after its caller disconnects at the write boundary',
  async () => {
    await withBothRegistries(async (base, sql, schema) => {
      const owner = await signup(base);
      const key = await createBrowserKey(base, owner.cookie);
      const before = await sql`SELECT * FROM apikey WHERE id = ${key.id}`;
      const settled = `settled:${key.id}`;
      await post(base, `/__test/gate/${key.id}/arm`, {});
      await post(base, `/__test/gate/${settled}/arm`, {});
      const abort = new AbortController();
      const requestId = randomUUID();
      const request = fetch(`${base}/api/v1/auth/whoami`, {
        headers: { Authorization: `Bearer ${key.key}`, 'X-Test-Request-Id': requestId },
        signal: abort.signal
      });
      try {
        expect(
          (await fetch(`${base}/__test/gate/${key.id}/wait`, { signal: AbortSignal.timeout(10_000) })).status
        ).toBe(204);
        abort.abort();
        await expect(request).rejects.toThrow();
        await waitForDisconnect(base, requestId);
        await post(base, `/__test/gate/${key.id}/release`, {});
        expect(
          (await fetch(`${base}/__test/gate/${settled}/wait`, { signal: AbortSignal.timeout(10_000) })).status
        ).toBe(204);
        expect(await sql`SELECT * FROM apikey WHERE id = ${key.id}`, `${schema}: no post-disconnect write`).toEqual(
          before
        );
      } finally {
        await post(base, `/__test/gate/${key.id}/release`, {}).catch(() => undefined);
        await post(base, `/__test/gate/${settled}/release`, {}).catch(() => undefined);
        await request.catch(() => undefined);
      }
    });
  },
  180_000
);

it.skipIf(!enabled || process.platform === 'win32')(
  'rolls back verification when its caller disconnects during deferred PostgreSQL work',
  async () => {
    await withBothRegistries(async (base, sql, schema) => {
      const owner = await signup(base);
      const key = await createBrowserKey(base, owner.cookie);
      const before = await sql`SELECT * FROM apikey WHERE id = ${key.id}`;
      await sql.unsafe(
        'CREATE FUNCTION pr492_slow_deferred_usage() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_sleep(3); RETURN NEW; END $$'
      );
      await sql.unsafe(
        `CREATE CONSTRAINT TRIGGER pr492_slow_deferred_usage AFTER UPDATE ON apikey DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (NEW.id = '${key.id}') EXECUTE FUNCTION pr492_slow_deferred_usage()`
      );
      const request = fetch(`${base}/api/v1/auth/whoami`, {
        headers: { Authorization: `Bearer ${key.key}` },
        signal: AbortSignal.timeout(1_500)
      });
      const deadline = Date.now() + 5_000;
      let sleeping = false;
      while (Date.now() < deadline) {
        const [row] = await sql`SELECT COUNT(*)::int AS count FROM pg_stat_activity
          WHERE pid <> pg_backend_pid() AND wait_event = 'PgSleep' AND datname = current_database()`;
        if (row.count) {
          sleeping = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      expect(sleeping, `${schema}: deferred trigger entered`).toBe(true);
      await expect(request).rejects.toThrow();
      while (Date.now() < deadline) {
        const [row] = await sql`SELECT COUNT(*)::int AS count FROM pg_stat_activity
          WHERE pid <> pg_backend_pid() AND wait_event = 'PgSleep' AND datname = current_database()`;
        if (!row.count) break;
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      // Wait for COMMIT/ROLLBACK to release the actual key row, not just for pg_sleep to end.
      await sql`SELECT id FROM apikey WHERE id = ${key.id} FOR UPDATE`;
      expect(await sql`SELECT * FROM apikey WHERE id = ${key.id}`, `${schema}: no post-timeout commit`).toEqual(before);
    });
  },
  180_000
);

it.skipIf(!enabled || process.platform === 'win32')(
  'does not mix a validated key policy with a different owner before usage commits',
  async () => {
    await withBothRegistries(async (base, sql, schema) => {
      const first = await signup(base);
      const second = await signup(base);
      const key = await createBrowserKey(base, first.cookie);
      await sql`UPDATE apikey SET permissions = ${'{"skills":["admin"]}'} WHERE id = ${key.id}`;
      const gate = `after:${key.id}`;
      expect((await post(base, `/__test/gate/${gate}/arm`, {})).status).toBe(204);
      const pending = whoami(base, key.key);
      try {
        expect((await fetch(`${base}/__test/gate/${gate}/wait`, { signal: AbortSignal.timeout(10_000) })).status).toBe(
          204
        );
        await sql`UPDATE apikey SET user_id = ${second.userId}, reference_id = ${second.userId},
          permissions = ${'{"skills":["read"]}'} WHERE id = ${key.id}`;
        expect((await post(base, `/__test/gate/${gate}/release`, {})).status).toBe(204);
        const response = await pending;
        expect(response.status, `${schema}: stale verification must not become another user`).toBe(401);
      } finally {
        await post(base, `/__test/gate/${gate}/release`, {}).catch(() => undefined);
        await pending.catch(() => undefined);
      }
    });
  },
  180_000
);

it.skipIf(!enabled || process.platform === 'win32')(
  'enforces a shared rate limit across simultaneous verification in separate registry processes',
  async () => {
    await withBothRegistries(async (base, sql, schema, database) => {
      const other = await startRegistry(database);
      try {
        const account = await signup(base);
        const key = await createBrowserKey(base, account.cookie);
        await sql`UPDATE apikey SET rate_limit_max = 2 WHERE id = ${key.id}`;
        expect((await post(base, `/__test/gate/${key.id}/arm`, { arrivals: 3 })).status).toBe(204);
        expect((await post(other.base, `/__test/gate/${key.id}/arm`, { arrivals: 2 })).status).toBe(204);
        const targets = [base, other.base, base, other.base, base];
        const pending = targets.map((target) =>
          fetch(`${target}/__test/scopes`, {
            headers: { Authorization: `Bearer ${key.key}` },
            signal: AbortSignal.timeout(20_000)
          })
        );
        try {
          for (const target of [base, other.base]) {
            expect(
              (await fetch(`${target}/__test/gate/${key.id}/wait`, { signal: AbortSignal.timeout(10_000) })).status
            ).toBe(204);
          }
          await Promise.all([base, other.base].map((target) => post(target, `/__test/gate/${key.id}/release`, {})));
          const responses = await Promise.all(pending);
          expect(
            responses.filter((response) => response.status === 200),
            `${schema}: exactly two requests succeed`
          ).toHaveLength(2);
          const [row] = await sql`SELECT request_count FROM apikey WHERE id = ${key.id}`;
          expect(row.request_count, `${schema}: both successful requests counted`).toBe(2);
        } finally {
          await Promise.allSettled(
            [base, other.base].map((target) => post(target, `/__test/gate/${key.id}/release`, {}))
          );
          await Promise.allSettled(pending);
        }
      } finally {
        await other.close();
      }
    });
  },
  180_000
);

it.skipIf(!enabled || process.platform === 'win32')(
  'rechecks browser ownership atomically when a key changes after the authorization read',
  async () => {
    await withBothRegistries(async (base, sql, schema) => {
      const first = await signup(base);
      const second = await signup(base);
      for (const operation of ['update', 'delete'] as const) {
        for (const change of ['conflict', 'transfer'] as const) {
          const key = await createBrowserKey(base, first.cookie);
          const gate = `${operation}:${key.id}`;
          expect((await post(base, `/__test/gate/${gate}/arm`, {})).status).toBe(204);
          const pending = post(
            base,
            `/api/auth/api-key/${operation}`,
            { keyId: key.id, name: 'Stale change' },
            first.cookie
          );
          try {
            const entered = await fetch(`${base}/__test/gate/${gate}/wait`, { signal: AbortSignal.timeout(10_000) });
            expect(entered.status, `${schema}: ${operation} entered`).toBe(204);
            if (change === 'conflict')
              await sql`UPDATE apikey SET reference_id = ${second.userId} WHERE id = ${key.id}`;
            else
              await sql`UPDATE apikey SET user_id = ${second.userId}, reference_id = ${second.userId} WHERE id = ${key.id}`;
            const before = await sql`SELECT * FROM apikey WHERE id = ${key.id}`;
            expect((await post(base, `/__test/gate/${gate}/release`, {})).status).toBe(204);
            const response = await pending;
            expect.soft(response.status, `${schema}: stale ${operation} rejected after ${change}`).toBe(409);
            expect
              .soft(await sql`SELECT * FROM apikey WHERE id = ${key.id}`, 'stale write left key unchanged')
              .toEqual(before);
            if (change === 'transfer') {
              expect.soft((await getKey(base, second.cookie, key.id)).status, 'new owner can manage key').toBe(200);
            }
          } finally {
            await post(base, `/__test/gate/${gate}/release`, {}).catch(() => undefined);
            await pending.catch(() => undefined);
          }
        }
      }
    });
  },
  180_000
);

it.skipIf(!enabled || process.platform === 'win32')(
  'rejects a duplicate introduced after verification reads the original key',
  async () => {
    await withBothRegistries(async (base, sql, schema) => {
      const first = await signup(base);
      const second = await signup(base);
      const key = await createBrowserKey(base, first.cookie);
      expect((await post(base, `/__test/gate/${key.id}/arm`, {})).status).toBe(204);
      const pending = fetch(`${base}/__test/scopes`, {
        headers: { Authorization: `Bearer ${key.key}` },
        signal: AbortSignal.timeout(20_000)
      });
      try {
        const entered = await fetch(`${base}/__test/gate/${key.id}/wait`, { signal: AbortSignal.timeout(10_000) });
        expect(entered.status).toBe(204);
        await seedKey(sql, { token: key.key, userId: second.userId, referenceId: second.userId });
        const hash = createHash('sha256').update(key.key).digest('base64url');
        const before = await sql`SELECT * FROM apikey WHERE key = ${hash} ORDER BY id`;
        expect((await post(base, `/__test/gate/${key.id}/release`, {})).status).toBe(204);
        expect((await pending).status, `${schema}: concurrent duplicate denied`).toBe(401);
        expect(await sql`SELECT * FROM apikey WHERE key = ${hash} ORDER BY id`).toEqual(before);
      } finally {
        await post(base, `/__test/gate/${key.id}/release`, {}).catch(() => undefined);
        await pending.catch(() => undefined);
      }
    });
  },
  180_000
);

it.skipIf(!enabled || process.platform === 'win32')(
  'rejects verification when a reference-only owner is deleted before the usage write',
  async () => {
    await withPushOnlyRegistry(async (base, sql) => {
      const account = await signup(base);
      const key = await createBrowserKey(base, account.cookie);
      await sql`UPDATE apikey SET user_id = NULL WHERE id = ${key.id}`;
      expect((await post(base, `/__test/gate/${key.id}/arm`, {})).status).toBe(204);
      const pending = fetch(`${base}/__test/scopes`, {
        headers: { Authorization: `Bearer ${key.key}` },
        signal: AbortSignal.timeout(20_000)
      });
      try {
        const entered = await fetch(`${base}/__test/gate/${key.id}/wait`, { signal: AbortSignal.timeout(10_000) });
        expect(entered.status).toBe(204);
        await deleteUser(base, account.userId);
        const before = await sql`SELECT * FROM apikey WHERE id = ${key.id}`;
        expect(before).toHaveLength(1);
        expect((await post(base, `/__test/gate/${key.id}/release`, {})).status).toBe(204);
        expect((await pending).status).toBe(401);
        expect(await sql`SELECT * FROM apikey WHERE id = ${key.id}`).toEqual(before);
        expect(await verifyPluginKey(base, key.key), 'raw verification also rejects an orphan').toBe(false);
      } finally {
        await post(base, `/__test/gate/${key.id}/release`, {}).catch(() => undefined);
        await pending.catch(() => undefined);
      }
    });
  },
  120_000
);

it.skipIf(!enabled || process.platform === 'win32')(
  'preserves expiration, remaining-use, refill, and rate-window limits',
  async () => {
    await withBothRegistries(async (base, sql, schema) => {
      const account = await signup(base);
      const expired = await createBrowserKey(base, account.cookie);
      await sql`UPDATE apikey SET expires_at = NOW() - INTERVAL '1 hour' WHERE id = ${expired.id}`;
      expect((await whoami(base, expired.key)).status, `${schema}: expiration`).toBe(401);
      const limited = await createBrowserKey(base, account.cookie);
      await sql`UPDATE apikey SET remaining = 2 WHERE id = ${limited.id}`;
      const limitedStatuses = [];
      for (let i = 0; i < 3; i++) limitedStatuses.push((await whoami(base, limited.key)).status);
      expect(limitedStatuses, `${schema}: usage limit`).toEqual([200, 200, 401]);
      const refilled = await createBrowserKey(base, account.cookie);
      await sql`UPDATE apikey SET remaining = 0, refill_amount = 2, refill_interval = 1000,
        last_refill_at = NOW() - INTERVAL '1 hour' WHERE id = ${refilled.id}`;
      const refillStatuses = [];
      for (let i = 0; i < 3; i++) refillStatuses.push((await whoami(base, refilled.key)).status);
      expect(refillStatuses, `${schema}: refill limit`).toEqual([200, 200, 401]);
      const window = await createBrowserKey(base, account.cookie);
      await sql`UPDATE apikey SET rate_limit_max = 2, rate_limit_time_window = 3600000,
        request_count = 10, last_request = NOW() - INTERVAL '2 hours' WHERE id = ${window.id}`;
      const windowStatuses = [];
      for (let i = 0; i < 3; i++) windowStatuses.push((await whoami(base, window.key)).status);
      expect(windowStatuses, `${schema}: rate window reset`).toEqual([200, 200, 401]);
      const duplicate = newToken();
      const ids = [
        await seedKey(sql, { token: duplicate, userId: account.userId, referenceId: account.userId }),
        await seedKey(sql, { token: duplicate, userId: account.userId, referenceId: account.userId })
      ].sort();
      await sql`UPDATE apikey SET refill_amount = 3, refill_interval = 3600000,
        last_refill_at = NOW() - INTERVAL '2 hours' WHERE id = ${ids[0]}`;
      await sql`UPDATE apikey SET refill_amount = 3, refill_interval = 3600000,
        last_refill_at = NOW() WHERE id = ${ids[1]}`;
      const [latest] = await sql`SELECT last_refill_at FROM apikey WHERE id = ${ids[1]}`;
      expect((await whoami(base, duplicate)).status).toBe(200);
      const timestamps = await sql`SELECT last_refill_at FROM apikey WHERE id = ANY(${ids})`;
      expect(timestamps.every((row) => row.last_refill_at.getTime() === latest.last_refill_at.getTime())).toBe(true);
      await sql`UPDATE apikey SET remaining = 1 WHERE id = ANY(${ids})`;
      expect((await whoami(base, duplicate)).status).toBe(200);
      expect((await whoami(base, duplicate)).status, `${schema}: no premature duplicate refill`).toBe(401);
    });
  },
  180_000
);

it.skipIf(!enabled || process.platform === 'win32')(
  'matches installed Better Auth for single-key nullable refill and safe expired or exhausted cleanup',
  async () => {
    await withBothRegistries(async (base, sql, schema) => {
      const owner = await signup(base);
      for (const scenario of ['nullable-refill', 'expired', 'exhausted'] as const) {
        const oldToken = newToken();
        const newTokenValue = newToken();
        const oldId = await seedKey(sql, { token: oldToken, userId: owner.userId, referenceId: owner.userId });
        const newId = await seedKey(sql, { token: newTokenValue, userId: owner.userId, referenceId: owner.userId });
        const ids = [oldId, newId];
        if (scenario === 'nullable-refill')
          await sql`UPDATE apikey SET remaining = 2, refill_amount = 2,
          refill_interval = 3600000, last_refill_at = NULL WHERE id = ANY(${ids})`;
        if (scenario === 'expired')
          await sql`UPDATE apikey SET expires_at = NOW() - INTERVAL '1 hour' WHERE id = ANY(${ids})`;
        if (scenario === 'exhausted')
          await sql`UPDATE apikey SET remaining = 0, refill_amount = NULL WHERE id = ANY(${ids})`;
        const legacy = await post(base, '/__test/legacy-verify-key', { key: oldToken });
        const current = await post(base, '/__test/verify-key', { key: newTokenValue });
        expect(legacy.status).toBe(200);
        expect(current.status).toBe(200);
        expect.soft((await current.json()).valid, `${schema}: ${scenario} validity`).toBe((await legacy.json()).valid);
        const oldRows = await sql`SELECT remaining, last_refill_at FROM apikey WHERE id = ${oldId}`;
        const newRows = await sql`SELECT remaining, last_refill_at FROM apikey WHERE id = ${newId}`;
        expect.soft(newRows, `${schema}: ${scenario} persisted state`).toEqual(oldRows);
      }
    });
  },
  180_000
);

it.skipIf(!enabled || process.platform === 'win32')(
  'rechecks verification cleanup under the lock and preserves disputed duplicate evidence',
  async () => {
    await withBothRegistries(async (base, sql, schema) => {
      const owner = await signup(base);
      const other = await signup(base);
      for (const scenario of ['expired', 'exhausted'] as const) {
        const key = await createBrowserKey(base, owner.cookie);
        if (scenario === 'expired')
          await sql`UPDATE apikey SET expires_at = NOW() - INTERVAL '1 hour' WHERE id = ${key.id}`;
        else await sql`UPDATE apikey SET remaining = 0, refill_amount = NULL WHERE id = ${key.id}`;
        const gate = `delete:${key.id}`;
        expect((await post(base, `/__test/gate/${gate}/arm`, {})).status).toBe(204);
        const pending = verifyPluginKey(base, key.key);
        try {
          expect(
            (await fetch(`${base}/__test/gate/${gate}/wait`, { signal: AbortSignal.timeout(10_000) })).status
          ).toBe(204);
          if (scenario === 'expired')
            await sql`UPDATE apikey SET expires_at = NOW() + INTERVAL '1 day' WHERE id = ${key.id}`;
          else await sql`UPDATE apikey SET remaining = 2 WHERE id = ${key.id}`;
          const before = await sql`SELECT * FROM apikey WHERE id = ${key.id}`;
          await post(base, `/__test/gate/${gate}/release`, {});
          expect(await pending, `${schema}: stale ${scenario} verification is denied`).toBe(false);
          expect(await sql`SELECT * FROM apikey WHERE id = ${key.id}`, `${schema}: re-enabled key survives`).toEqual(
            before
          );
          expect((await whoami(base, key.key)).status, `${schema}: corrected key is usable`).toBe(200);
        } finally {
          await post(base, `/__test/gate/${gate}/release`, {}).catch(() => undefined);
          await pending.catch(() => undefined);
        }
      }
      const token = newToken();
      const ids = [
        await seedKey(sql, { token, userId: owner.userId, referenceId: owner.userId }),
        await seedKey(sql, { token, userId: other.userId, referenceId: other.userId })
      ];
      await sql`UPDATE apikey SET expires_at = NOW() - INTERVAL '1 hour' WHERE id = ANY(${ids})`;
      const before = await sql`SELECT * FROM apikey WHERE id = ANY(${ids}) ORDER BY id`;
      expect(await verifyPluginKey(base, token)).toBe(false);
      expect(
        await sql`SELECT * FROM apikey WHERE id = ANY(${ids}) ORDER BY id`,
        `${schema}: conflict retained`
      ).toEqual(before);
    });
  },
  180_000
);

it.skipIf(!enabled || process.platform === 'win32')(
  'hides ambiguous duplicate secrets and revokes all copies of an equivalent secret',
  async () => {
    await withBothRegistries(async (base, sql, schema) => {
      const first = await signup(base);
      const second = await signup(base);
      const disputedToken = newToken();
      const disputedFirst = await seedKey(sql, {
        token: disputedToken,
        userId: first.userId,
        referenceId: first.userId
      });
      const disputedSecond = await seedKey(sql, {
        token: disputedToken,
        userId: second.userId,
        referenceId: second.userId
      });
      const before = await sql`SELECT * FROM apikey WHERE id = ANY(${[disputedFirst, disputedSecond]}) ORDER BY id`;
      for (const [cookie, id] of [
        [first.cookie, disputedFirst],
        [second.cookie, disputedSecond]
      ]) {
        expect.soft(await listKeyIds(base, cookie), `${schema}: duplicate hidden`).not.toContain(id);
        expect.soft((await getKey(base, cookie, id)).status).toBe(404);
        expect.soft((await post(base, '/api/auth/api-key/delete', { keyId: id }, cookie)).status).toBe(404);
      }
      expect
        .soft(await sql`SELECT * FROM apikey WHERE id = ANY(${[disputedFirst, disputedSecond]}) ORDER BY id`)
        .toEqual(before);
      const equivalentToken = newToken();
      const one = await seedKey(sql, {
        token: equivalentToken,
        userId: first.userId,
        referenceId: null,
        permissions: '{"skills":["read","publish"]}'
      });
      const two = await seedKey(sql, {
        token: equivalentToken,
        userId: first.userId,
        referenceId: first.userId,
        permissions: '{ "skills": ["publish", "read"] }'
      });
      await sql`UPDATE apikey SET config_id = NULL, enabled = NULL, rate_limit_enabled = NULL WHERE id = ${one}`;
      expect.soft((await whoami(base, equivalentToken)).status).toBe(200);
      expect
        .soft((await post(base, '/api/auth/api-key/update', { keyId: one, enabled: false }, first.cookie)).status)
        .toBe(200);
      expect.soft((await whoami(base, equivalentToken)).status, 'disabling one copy disables the secret').toBe(401);
      expect
        .soft((await post(base, '/api/auth/api-key/update', { keyId: one, enabled: true }, first.cookie)).status)
        .toBe(200);
      expect.soft((await whoami(base, equivalentToken)).status).toBe(200);
      expect.soft((await post(base, '/api/auth/api-key/delete', { keyId: one }, first.cookie)).status).toBe(200);
      expect.soft((await whoami(base, equivalentToken)).status, 'revocation invalidates the whole secret').toBe(401);
      expect.soft(await sql`SELECT id FROM apikey WHERE id = ANY(${[one, two]})`).toHaveLength(0);
    });
  },
  180_000
);

it.skipIf(!enabled || process.platform === 'win32')(
  'allows the sole owner to find and revoke differently configured copies without authenticating them',
  async () => {
    await withBothRegistries(async (base, sql, schema) => {
      await ensureServiceAccounts(sql);
      const owner = await signup(base);
      const other = await signup(base);
      for (const difference of ['scope', 'enabled', 'expiry', 'rate', 'remaining'] as const) {
        const token = newToken();
        const first = await seedKey(sql, { token, userId: owner.userId, referenceId: null });
        const second = await seedKey(sql, {
          token,
          userId: owner.userId,
          referenceId: owner.userId,
          permissions: difference === 'scope' ? '{"skills":["read"]}' : null,
          enabled: difference !== 'enabled'
        });
        if (difference === 'expiry')
          await sql`UPDATE apikey SET expires_at = NOW() + INTERVAL '1 day' WHERE id = ${second}`;
        if (difference === 'rate') await sql`UPDATE apikey SET rate_limit_max = 2 WHERE id = ${second}`;
        if (difference === 'remaining') await sql`UPDATE apikey SET remaining = 3 WHERE id = ${second}`;
        const ids = [first, second];
        const before = await sql`SELECT * FROM apikey WHERE id = ANY(${ids}) ORDER BY id`;
        expect.soft((await whoami(base, token)).status, `${schema}: ${difference} remains denied`).toBe(401);
        expect
          .soft(await listKeyIds(base, owner.cookie), `${schema}: owner sees both ${difference} copies`)
          .toEqual(expect.arrayContaining(ids));
        expect.soft((await getKey(base, owner.cookie, first)).status, `${schema}: owner gets ${difference}`).toBe(200);
        expect.soft((await getKey(base, other.cookie, first)).status, `${schema}: other cannot inspect`).toBe(404);
        expect.soft((await post(base, '/api/auth/api-key/delete', { keyId: first }, other.cookie)).status).toBe(404);
        expect
          .soft(
            (await post(base, '/api/auth/api-key/update', { keyId: first, name: 'Unsafe update' }, owner.cookie)).status
          )
          .toBe(409);
        expect.soft(await sql`SELECT * FROM apikey WHERE id = ANY(${ids}) ORDER BY id`).toEqual(before);
        expect.soft((await post(base, '/api/auth/api-key/delete', { keyId: first }, owner.cookie)).status).toBe(200);
        expect
          .soft(await sql`SELECT id FROM apikey WHERE id = ANY(${ids})`, `${schema}: all copies revoked`)
          .toHaveLength(0);
      }
    });
  },
  180_000
);

it.skipIf(!enabled || process.platform === 'win32')(
  'blocks owner deletion for enabled and disabled separate service accounts without partial changes',
  async () => {
    await withBothRegistries(async (base, sql, schema) => {
      await ensureServiceAccounts(sql);
      for (const disabled of [true, false]) {
        const owner = await signup(base);
        const serviceUser = await signup(base);
        const [service] = await sql`INSERT INTO service_accounts (user_id, owner_user_id, display_name, disabled)
          VALUES (${serviceUser.userId}, ${owner.userId}, 'Owned account', ${disabled}) RETURNING id`;
        const token = newToken();
        const key = await seedKey(sql, { token, userId: serviceUser.userId, referenceId: serviceUser.userId });
        expect((await whoami(base, token)).status, `${schema}: original access`).toBe(disabled ? 401 : 200);
        const ownerBefore = {
          user: await sql`SELECT * FROM "user" WHERE id = ${owner.userId}`,
          accounts: await sql`SELECT * FROM account WHERE user_id = ${owner.userId} ORDER BY id`,
          sessions: await sql`SELECT * FROM session WHERE user_id = ${owner.userId} ORDER BY id`
        };
        const serviceBefore = await sql`SELECT * FROM service_accounts WHERE id = ${service.id}`;
        const keyBefore = await sql`SELECT * FROM apikey WHERE id = ${key}`;
        const deletion = await post(
          base,
          '/api/auth/delete-user',
          { password: 'local-test-password-123' },
          owner.cookie
        );
        expect.soft(deletion.status, `${schema}: ownership deletion blocked`).toBe(409);
        expect.soft((await deletion.json()).code).toBe('SERVICE_ACCOUNT_OWNERSHIP_CONFLICT');
        expect.soft(await sql`SELECT * FROM "user" WHERE id = ${owner.userId}`).toEqual(ownerBefore.user);
        expect
          .soft(await sql`SELECT * FROM account WHERE user_id = ${owner.userId} ORDER BY id`)
          .toEqual(ownerBefore.accounts);
        expect
          .soft(await sql`SELECT * FROM session WHERE user_id = ${owner.userId} ORDER BY id`)
          .toEqual(ownerBefore.sessions);
        expect.soft(await sql`SELECT * FROM service_accounts WHERE id = ${service.id}`).toEqual(serviceBefore);
        expect
          .soft(await sql`SELECT * FROM apikey WHERE id = ${key}`, `${schema}: no silent revocation`)
          .toEqual(keyBefore);
        expect
          .soft((await whoami(base, token)).status, `${schema}: service access remains unchanged`)
          .toBe(disabled ? 401 : 200);
      }
    });
  },
  180_000
);

it.skipIf(!enabled || process.platform === 'win32')(
  'blocks deletion of a service owner until its separate service account is explicitly deleted',
  async () => {
    await withBothRegistries(async (base, sql, schema) => {
      await ensureServiceAccounts(sql);
      const admin = await signupAdmin(base, sql);
      const owner = await signup(base);
      const child = await signup(base);
      const [ownerService] = await sql`INSERT INTO service_accounts (user_id, owner_user_id, display_name, disabled)
        VALUES (${owner.userId}, ${admin.userId}, 'Parent service', false) RETURNING id`;
      const [childService] = await sql`INSERT INTO service_accounts (user_id, owner_user_id, display_name, disabled)
        VALUES (${child.userId}, ${owner.userId}, 'Child service', true) RETURNING id`;
      const key = await createBrowserKey(base, child.cookie);
      const hash = createHash('sha256').update(key.key).digest('base64url');
      const before = {
        owner: await deletionState(sql, owner.userId, hash),
        child: await deletionState(sql, child.userId, hash)
      };
      const blocked = await serviceRequest(base, admin.cookie, 'DELETE', `/${ownerService.id}`);
      expect(blocked.status, `${schema}: parent service owner blocked`).toBe(409);
      expect((await blocked.json()).code).toBe('SERVICE_ACCOUNT_OWNERSHIP_CONFLICT');
      expect(await deletionState(sql, owner.userId, hash)).toEqual(before.owner);
      expect(await deletionState(sql, child.userId, hash)).toEqual(before.child);
      expect((await serviceRequest(base, admin.cookie, 'DELETE', `/${childService.id}`)).status).toBe(200);
      expect(await sql`SELECT id FROM apikey WHERE id = ${key.id}`).toHaveLength(0);
      expect((await serviceRequest(base, admin.cookie, 'DELETE', `/${ownerService.id}`)).status).toBe(200);
      expect(await sql`SELECT id FROM "user" WHERE id = ${owner.userId}`).toHaveLength(0);
    });
  },
  180_000
);

async function deletionState(sql: TestSql, userId: string, hash: string) {
  return {
    user: await sql`SELECT * FROM "user" WHERE id = ${userId}`,
    accounts: await sql`SELECT * FROM account WHERE user_id = ${userId} ORDER BY id`,
    sessions: await sql`SELECT * FROM session WHERE user_id = ${userId} ORDER BY id`,
    serviceAccounts: await sql`SELECT * FROM service_accounts WHERE user_id = ${userId} ORDER BY id`,
    keys: await sql`SELECT * FROM apikey WHERE key = ${hash} ORDER BY id`
  };
}

async function ensureServiceAccounts(sql: TestSql): Promise<void> {
  const [result] = await sql`SELECT to_regclass('public.service_accounts') AS name`;
  if (result.name) return;
  // This historical migration is not in Drizzle's journal; run it only in the owned fixture.
  const migration = await readFile(path.join(registry, 'drizzle/0007_parched_scream.sql'), 'utf8');
  await sql.unsafe(migration);
}

async function serviceRequest(base: string, cookie: string, method: string, path: string, body?: unknown) {
  return fetch(`${base}/__test/service-accounts${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Origin: base, Cookie: cookie },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
}

async function startUncommittedDuplicate(database: OwnedTestDatabase, token: string, userId: string) {
  await assertOwnedTestDatabaseAlive(database);
  const writer = postgres(database.url, { max: 1, connect_timeout: 3 });
  let entered!: () => void;
  let release!: () => void;
  const ready = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const id = randomUUID();
  const hash = createHash('sha256').update(token).digest('base64url');
  const pending = writer.begin(async (tx) => {
    await tx.unsafe(
      "INSERT INTO apikey (id, name, key, user_id, reference_id, config_id, created_at, updated_at) VALUES ($1, 'Concurrent duplicate', $2, $3, $3, 'default', NOW(), NOW())",
      [id, hash, userId]
    );
    entered();
    await gate;
  });
  try {
    await Promise.race([
      ready,
      pending.then(() => {
        throw new Error('Duplicate insertion ended before synchronization');
      })
    ]);
  } catch (error) {
    release();
    await writer.end({ timeout: 3 });
    throw error;
  }
  return {
    id,
    async commit() {
      release();
      await pending;
    },
    async close() {
      release();
      await pending.catch(() => undefined);
      await writer.end({ timeout: 3 });
    }
  };
}

async function waitForKeyTableLock(sql: TestSql): Promise<void> {
  const deadline = Date.now() + 4_000;
  while (Date.now() < deadline) {
    const [row] = await sql`SELECT COUNT(*)::int AS count FROM pg_locks l
      JOIN pg_class c ON c.oid = l.relation WHERE c.relname = 'apikey'
      AND l.mode = 'ShareRowExclusiveLock' AND NOT l.granted`;
    if (row.count) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error('Expected a PostgreSQL API-key table-lock waiter');
}

async function startServiceOwnershipChange(
  database: OwnedTestDatabase,
  ownerId: string,
  serviceUserId: string,
  existingId?: string
) {
  await assertOwnedTestDatabaseAlive(database);
  const writer = postgres(database.url, { max: 1, connect_timeout: 3 });
  let entered!: () => void;
  let release!: () => void;
  const ready = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const pending = writer.begin(async (tx) => {
    if (existingId) {
      await tx.unsafe('UPDATE service_accounts SET owner_user_id = $1 WHERE id = $2', [ownerId, existingId]);
    } else {
      await tx.unsafe(
        "INSERT INTO service_accounts (user_id, owner_user_id, display_name, disabled) VALUES ($1, $2, 'Racing service', true)",
        [serviceUserId, ownerId]
      );
    }
    entered();
    await gate;
  });
  try {
    await Promise.race([
      ready,
      pending.then(() => {
        throw new Error('Service change ended before synchronization');
      })
    ]);
  } catch (error) {
    release();
    await writer.end({ timeout: 3 });
    throw error;
  }
  return {
    async commit() {
      release();
      await pending;
    },
    async close() {
      release();
      await pending.catch(() => undefined);
      await writer.end({ timeout: 3 });
    }
  };
}

async function waitForServiceTableLock(sql: TestSql): Promise<void> {
  const deadline = Date.now() + 4_000;
  while (Date.now() < deadline) {
    const [row] = await sql`SELECT COUNT(*)::int AS count FROM pg_locks l
      JOIN pg_class c ON c.oid = l.relation WHERE c.relname = 'service_accounts'
      AND l.mode = 'ShareRowExclusiveLock' AND NOT l.granted`;
    if (row.count) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error('Expected a PostgreSQL service-account table-lock waiter');
}

async function waitForServiceWriterBlocked(sql: TestSql): Promise<void> {
  const deadline = Date.now() + 4_000;
  while (Date.now() < deadline) {
    const [row] = await sql`SELECT COUNT(*)::int AS count FROM pg_stat_activity
      WHERE wait_event_type = 'Lock' AND query ILIKE '%service_accounts%'`;
    if (row.count) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error('Expected a PostgreSQL service-account lock waiter');
}

it.skipIf(!enabled || process.platform === 'win32')(
  'keeps unrelated verification available while deletion waits for a service-account writer',
  async () => {
    await withBothRegistries(async (base, sql, schema, database) => {
      await ensureServiceAccounts(sql);
      const owner = await signup(base);
      const serviceUser = await signup(base);
      const other = await startRegistry(database);
      const unrelated = await signup(other.base);
      const key = await createBrowserKey(other.base, unrelated.cookie);
      const change = await startServiceOwnershipChange(database, owner.userId, serviceUser.userId);
      let deletion: Promise<Response> | undefined;
      try {
        deletion = deleteUserResponse(base, owner.userId);
        await waitForServiceTableLock(sql);
        const start = performance.now();
        const response = await fetch(`${other.base}/api/v1/auth/whoami`, {
          headers: { Authorization: `Bearer ${key.key}` },
          signal: AbortSignal.timeout(2_500)
        }).catch(() => null);
        expect.soft(response?.status, `${schema}: unrelated key does not wait on deletion`).toBe(200);
        process.stdout.write(
          `API_KEY_SERVICE_CONTENTION ${JSON.stringify({ schema, elapsedMs: Math.round(performance.now() - start), status: response?.status ?? 'timeout' })}\n`
        );
        await change.commit();
        expect((await deletion).status, `${schema}: new ownership blocks deletion`).toBe(409);
      } finally {
        await change.close();
        await deletion?.catch(() => undefined);
        await other.close();
      }
    });
  },
  180_000
);

it.skipIf(!enabled || process.platform === 'win32')(
  'keeps unrelated verification available while service-key revocation waits for a service-account writer',
  async () => {
    await withBothRegistries(async (base, sql, schema, database) => {
      await ensureServiceAccounts(sql);
      const admin = await signupAdmin(base, sql);
      const serviceUser = await signup(base);
      const [service] = await sql`INSERT INTO service_accounts (user_id, owner_user_id, display_name, disabled)
        VALUES (${serviceUser.userId}, ${admin.userId}, 'Revocation lock order', false) RETURNING id`;
      const serviceKey = await createBrowserKey(base, serviceUser.cookie);
      const other = await startRegistry(database);
      const unrelated = await signup(other.base);
      const unrelatedKey = await createBrowserKey(other.base, unrelated.cookie);
      const change = await startServiceOwnershipChange(database, admin.userId, serviceUser.userId, service.id);
      let revocation: Promise<Response> | undefined;
      try {
        revocation = serviceRequest(base, admin.cookie, 'DELETE', `/${service.id}/keys/${serviceKey.id}`);
        await waitForServiceWriterBlocked(sql);
        const start = performance.now();
        const response = await fetch(`${other.base}/api/v1/auth/whoami`, {
          headers: { Authorization: `Bearer ${unrelatedKey.key}` },
          signal: AbortSignal.timeout(2_500)
        }).catch(() => null);
        expect.soft(response?.status, `${schema}: unrelated key does not wait on revocation`).toBe(200);
        process.stdout.write(
          `API_KEY_SERVICE_REVOKE_CONTENTION ${JSON.stringify({ schema, elapsedMs: Math.round(performance.now() - start), status: response?.status ?? 'timeout' })}\n`
        );
        await change.commit();
        expect((await revocation).status, `${schema}: key revoked after writer commits`).toBe(200);
        expect(await sql`SELECT id FROM apikey WHERE id = ${serviceKey.id}`).toHaveLength(0);
      } finally {
        await change.close();
        await revocation?.catch(() => undefined);
        await other.close();
      }
    });
  },
  180_000
);

it.skipIf(!enabled || process.platform === 'win32')(
  'serializes owner deletion against concurrent service-account creation and ownership changes',
  async () => {
    await withBothRegistries(async (base, sql, schema, database) => {
      await ensureServiceAccounts(sql);
      for (const operation of ['create', 'change-owner'] as const) {
        const owner = await signup(base);
        const other = await signup(base);
        const serviceUser = await signup(base);
        const key = await createBrowserKey(base, serviceUser.cookie);
        const [existing] =
          operation === 'change-owner'
            ? await sql`INSERT INTO service_accounts (user_id, owner_user_id, display_name, disabled)
              VALUES (${serviceUser.userId}, ${other.userId}, 'Racing transfer', true) RETURNING id`
            : [];
        const before = {
          user: await sql`SELECT * FROM "user" WHERE id = ${owner.userId}`,
          accounts: await sql`SELECT * FROM account WHERE user_id = ${owner.userId} ORDER BY id`,
          sessions: await sql`SELECT * FROM session WHERE user_id = ${owner.userId} ORDER BY id`,
          key: await sql`SELECT * FROM apikey WHERE id = ${key.id}`
        };
        const change = await startServiceOwnershipChange(database, owner.userId, serviceUser.userId, existing?.id);
        let deletion: Promise<Response> | undefined;
        try {
          deletion = deleteUserResponse(base, owner.userId);
          await waitForServiceTableLock(sql);
          await change.commit();
          const result = await deletion;
          expect(result.status, `${schema}: ${operation} blocks deletion`).toBe(409);
          expect((await result.json()).code).toBe('SERVICE_ACCOUNT_OWNERSHIP_CONFLICT');
          expect(await sql`SELECT * FROM "user" WHERE id = ${owner.userId}`).toEqual(before.user);
          expect(await sql`SELECT * FROM account WHERE user_id = ${owner.userId} ORDER BY id`).toEqual(before.accounts);
          expect(await sql`SELECT * FROM session WHERE user_id = ${owner.userId} ORDER BY id`).toEqual(before.sessions);
          expect(await sql`SELECT * FROM apikey WHERE id = ${key.id}`).toEqual(before.key);
          expect(
            await sql`SELECT id FROM service_accounts WHERE user_id = ${serviceUser.userId}
            AND owner_user_id = ${owner.userId}`
          ).toHaveLength(1);
          expect((await whoami(base, key.key)).status).toBe(401);
        } finally {
          await change.close();
          await deletion?.catch(() => undefined);
        }
      }
    });
  },
  180_000
);

it.skipIf(!enabled || process.platform === 'win32')(
  'rolls back service-account creation when owner deletion wins the table-lock race',
  async () => {
    await withBothRegistries(async (base, sql, schema, database) => {
      await ensureServiceAccounts(sql);
      const owner = await signupAdmin(base, sql);
      const other = await startRegistry(database);
      const writer = postgres(database.url, { max: 1, connect_timeout: 3 });
      let entered!: () => void;
      let release!: () => void;
      const ready = new Promise<void>((resolve) => {
        entered = resolve;
      });
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const held = writer.begin(async (tx) => {
        await tx.unsafe('LOCK TABLE service_accounts IN SHARE ROW EXCLUSIVE MODE');
        entered();
        await gate;
      });
      const name = `Racing create ${randomUUID()}`;
      let deletion: Promise<Response> | undefined;
      let creation: Promise<Response> | undefined;
      try {
        await Promise.race([
          ready,
          held.then(() => {
            throw new Error('Table lock ended before synchronization');
          })
        ]);
        deletion = deleteUserResponse(base, owner.userId);
        await waitForServiceTableLock(sql);
        creation = serviceRequest(other.base, owner.cookie, 'POST', '', { displayName: name });
        const deadline = Date.now() + 4_000;
        let waiting = false;
        while (Date.now() < deadline) {
          const [row] = await sql`SELECT COUNT(*)::int AS count FROM pg_locks l JOIN pg_class c ON c.oid = l.relation
            WHERE c.relname = 'service_accounts' AND l.mode = 'RowExclusiveLock' AND NOT l.granted`;
          if (row.count) {
            waiting = true;
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, 20));
        }
        if (!waiting) {
          const result = await Promise.race([
            creation,
            new Promise<null>((resolve) => setTimeout(() => resolve(null), 50))
          ]);
          const activity =
            await sql`SELECT state, wait_event_type, wait_event, LEFT(query, 160) AS query FROM pg_stat_activity
            WHERE datname = current_database() AND pid <> pg_backend_pid()`;
          throw new Error(
            `${schema}: creation did not reach the table (status ${result?.status}, activity ${JSON.stringify(activity)})`
          );
        }
        expect(waiting, `${schema}: creation reached the locked table`).toBe(true);
        release();
        await held;
        expect((await deletion).status, `${schema}: owner deleted first`).toBe(204);
        expect((await creation).ok, `${schema}: creation cannot outlive its owner`).toBe(false);
        expect(await sql`SELECT id FROM service_accounts WHERE display_name = ${name}`).toHaveLength(0);
        expect(await sql`SELECT id FROM "user" WHERE name = ${name}`, `${schema}: no orphan user`).toHaveLength(0);
      } finally {
        release();
        await held.catch(() => undefined);
        await writer.end({ timeout: 3 });
        await deletion?.catch(() => undefined);
        await creation?.catch(() => undefined);
        await other.close();
      }
    });
  },
  180_000
);

it.skipIf(!enabled || process.platform === 'win32')(
  'fails closed without changing data on a genuine journal-only migrated database',
  async () => {
    await withRegistry('migrated', async (base, sql) => {
      expect((await sql`SELECT to_regclass('service_accounts') AS name`)[0].name).toBeNull();
      const owner = await signup(base);
      const key = await createBrowserKey(base, owner.cookie);
      await sql`UPDATE apikey SET remaining = 1 WHERE id = ${key.id}`;
      const before = await ownerAndKeyState(sql, [owner.userId], [key.id]);
      await expectSafetyUnavailable(await whoami(base, key.key), key.key, 'genuine migration-only authentication');
      await expectSafetyUnavailable(
        await post(base, '/api/auth/delete-user', { password: 'local-test-password-123' }, owner.cookie),
        key.key,
        'genuine migration-only browser deletion'
      );
      expect((await deleteUserResponse(base, owner.userId)).status, 'genuine migration-only deletion').toBe(503);
      expect(await ownerAndKeyState(sql, [owner.userId], [key.id])).toEqual(before);
      await ensureServiceAccounts(sql);
      expect((await whoami(base, key.key)).status, 'same key works after test-only schema repair').toBe(200);
      await deleteUser(base, owner.userId);
      expect(await sql`SELECT id FROM "user" WHERE id = ${owner.userId}`).toHaveLength(0);
      expect(await sql`SELECT id FROM apikey WHERE id = ${key.id}`).toHaveLength(0);
    });
  },
  120_000
);

it.skipIf(!enabled || process.platform === 'win32')(
  'does not miss an owned service account created by an in-flight migration',
  async () => {
    await withRegistry('migrated', async (base, sql, database) => {
      expect((await sql`SELECT to_regclass('service_accounts') AS name`)[0].name).toBeNull();
      const owner = await signup(base);
      const serviceUser = await signup(base);
      const key = await createBrowserKey(base, serviceUser.cookie);
      const before = {
        user: await sql`SELECT * FROM "user" WHERE id = ${owner.userId}`,
        accounts: await sql`SELECT * FROM account WHERE user_id = ${owner.userId} ORDER BY id`,
        sessions: await sql`SELECT * FROM session WHERE user_id = ${owner.userId} ORDER BY id`,
        key: await sql`SELECT * FROM apikey WHERE id = ${key.id}`
      };
      const migration = await readFile(path.join(registry, 'drizzle/0007_parched_scream.sql'), 'utf8');
      const writer = postgres(database.url, { max: 1, connect_timeout: 3 });
      let entered!: () => void;
      let release!: () => void;
      const ready = new Promise<void>((resolve) => {
        entered = resolve;
      });
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const creating = writer.begin(async (tx) => {
        await tx.unsafe(migration);
        await tx.unsafe(
          "INSERT INTO service_accounts (user_id, owner_user_id, display_name, disabled) VALUES ($1, $2, 'Migrating service', true)",
          [serviceUser.userId, owner.userId]
        );
        entered();
        await gate;
      });
      let deletion: Promise<Response> | undefined;
      try {
        await Promise.race([
          ready,
          creating.then(() => {
            throw new Error('Migration ended before synchronization');
          })
        ]);
        deletion = deleteUserResponse(base, owner.userId);
        const deadline = Date.now() + 4_000;
        let waiting = false;
        while (Date.now() < deadline) {
          const [row] = await sql`SELECT COUNT(*)::int AS count FROM pg_locks l JOIN pg_class c ON c.oid = l.relation
            WHERE c.relname = 'user' AND NOT l.granted`;
          if (row.count) {
            waiting = true;
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, 20));
        }
        expect(waiting, 'deletion waits for the in-flight migration').toBe(true);
        release();
        await creating;
        const response = await deletion;
        expect(response.status, 'migration-created ownership blocks deletion').toBe(409);
        expect((await response.json()).code).toBe('SERVICE_ACCOUNT_OWNERSHIP_CONFLICT');
        expect(await sql`SELECT * FROM "user" WHERE id = ${owner.userId}`).toEqual(before.user);
        expect(await sql`SELECT * FROM account WHERE user_id = ${owner.userId} ORDER BY id`).toEqual(before.accounts);
        expect(await sql`SELECT * FROM session WHERE user_id = ${owner.userId} ORDER BY id`).toEqual(before.sessions);
        expect(await sql`SELECT * FROM apikey WHERE id = ${key.id}`).toEqual(before.key);
        expect(await sql`SELECT id FROM service_accounts WHERE owner_user_id = ${owner.userId}`).toHaveLength(1);
        expect((await whoami(base, key.key)).status).toBe(401);
      } finally {
        release();
        await creating.catch(() => undefined);
        await writer.end({ timeout: 3 });
        await deletion?.catch(() => undefined);
      }
    });
  },
  120_000
);

async function waitForHeldPool(sql: TestSql, query = 'SELECT pg_sleep(7)'): Promise<void> {
  const deadline = Date.now() + 4_000;
  while (Date.now() < deadline) {
    const [row] = await sql`SELECT COUNT(*)::int AS count FROM pg_stat_activity
      WHERE pid <> pg_backend_pid() AND state = 'active' AND query = ${query}`;
    if (row.count) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error('Expected the registry connection to be occupied');
}

it.skipIf(!enabled || process.platform === 'win32')(
  'blocks deletion that would erase a cross-owner duplicate secret without deleting account data',
  async () => {
    await withBothRegistries(async (base, sql, schema) => {
      await ensureServiceAccounts(sql);
      const first = await signup(base);
      const second = await signup(base);
      const token = newToken();
      await seedKey(sql, { token, userId: first.userId, referenceId: first.userId });
      await seedKey(sql, { token, userId: second.userId, referenceId: second.userId });
      expect((await whoami(base, token)).status, `${schema}: initially disputed`).toBe(401);
      const hash = createHash('sha256').update(token).digest('base64url');
      const before = await deletionState(sql, first.userId, hash);
      expect(before.accounts.length).toBeGreaterThan(0);
      expect(before.sessions.length).toBeGreaterThan(0);
      const deletion = await deleteUserResponse(base, first.userId);
      expect.soft(deletion.status, `${schema}: blocked with conflict`).toBe(409);
      expect.soft((await deletion.json()).code).toBe('API_KEY_OWNERSHIP_CONFLICT');
      expect.soft(await deletionState(sql, first.userId, hash), `${schema}: no partial side effects`).toEqual(before);
      const httpDeletion = await post(
        base,
        '/api/auth/delete-user',
        { password: 'local-test-password-123' },
        first.cookie
      );
      expect.soft(httpDeletion.status, `${schema}: direct Better Auth endpoint blocked`).toBe(409);
      expect.soft((await httpDeletion.json()).code).toBe('API_KEY_OWNERSHIP_CONFLICT');
      expect
        .soft(await deletionState(sql, first.userId, hash), `${schema}: HTTP deletion has no side effects`)
        .toEqual(before);
      expect.soft((await whoami(base, token)).status, `${schema}: dispute remains rejected`).toBe(401);
    });
  },
  180_000
);

it.skipIf(!enabled || process.platform === 'win32')(
  'keeps aging sessions unchanged when Better Auth blocks a disputed user deletion',
  async () => {
    await withBothRegistries(async (base, sql, schema) => {
      await ensureServiceAccounts(sql);
      const owner = await signup(base);
      const other = await signup(base);
      const token = newToken();
      await seedKey(sql, { token, userId: owner.userId, referenceId: owner.userId });
      await seedKey(sql, { token, userId: other.userId, referenceId: other.userId });
      const hash = createHash('sha256').update(token).digest('base64url');
      await sql`UPDATE session SET expires_at = NOW() + INTERVAL '2 days', updated_at = NOW() - INTERVAL '5 days'
        WHERE user_id = ${owner.userId}`;
      const before = await deletionState(sql, owner.userId, hash);
      const response = await post(base, '/api/auth/delete-user', { password: 'local-test-password-123' }, owner.cookie);
      expect.soft(response.status, `${schema}: deletion blocked`).toBe(409);
      expect
        .soft(await deletionState(sql, owner.userId, hash), `${schema}: sessions and account data unchanged`)
        .toEqual(before);
      expect.soft((await whoami(base, token)).status).toBe(401);
      const normalSession = await fetch(`${base}/api/auth/get-session`, {
        headers: { Cookie: owner.cookie, Origin: base }
      });
      expect.soft(normalSession.status, `${schema}: normal session request`).toBe(200);
      const sessionsAfter = await sql`SELECT * FROM session WHERE user_id = ${owner.userId} ORDER BY id`;
      expect
        .soft(sessionsAfter[0].expires_at.getTime(), `${schema}: normal session refresh still works`)
        .toBeGreaterThan(before.sessions[0].expires_at.getTime());
    });
  },
  180_000
);

it.skipIf(!enabled || process.platform === 'win32')(
  'blocks service-account deletion atomically, including disabled service accounts',
  async () => {
    await withBothRegistries(async (base, sql, schema) => {
      await ensureServiceAccounts(sql);
      const admin = await signupAdmin(base, sql);
      const serviceUser = await signup(base);
      const other = await signup(base);
      const [service] = await sql`INSERT INTO service_accounts (user_id, owner_user_id, display_name, disabled)
        VALUES (${serviceUser.userId}, ${admin.userId}, 'Disabled test account', true) RETURNING id`;
      const token = newToken();
      await seedKey(sql, { token, userId: serviceUser.userId, referenceId: serviceUser.userId });
      await seedKey(sql, { token, userId: other.userId, referenceId: other.userId });
      const hash = createHash('sha256').update(token).digest('base64url');
      const before = await deletionState(sql, serviceUser.userId, hash);
      expect(before.accounts.length).toBeGreaterThan(0);
      expect(before.sessions.length).toBeGreaterThan(0);
      expect(before.serviceAccounts[0].disabled).toBe(true);
      expect((await serviceRequest(base, other.cookie, 'DELETE', `/${service.id}`)).status, 'non-admin denied').toBe(
        403
      );
      const deletion = await serviceRequest(base, admin.cookie, 'DELETE', `/${service.id}`);
      expect.soft(deletion.status, `${schema}: service-account deletion blocked`).toBe(409);
      expect.soft((await deletion.json()).code).toBe('API_KEY_OWNERSHIP_CONFLICT');
      expect.soft(await deletionState(sql, serviceUser.userId, hash), `${schema}: no partial deletion`).toEqual(before);
      expect.soft((await whoami(base, token)).status).toBe(401);
      const legitimate = await signup(base);
      const [safeService] = await sql`INSERT INTO service_accounts (user_id, owner_user_id, display_name, disabled)
        VALUES (${legitimate.userId}, ${admin.userId}, 'Safe disabled account', true) RETURNING id`;
      const safeToken = newToken();
      const safeId = await seedKey(sql, {
        token: safeToken,
        userId: legitimate.userId,
        referenceId: legitimate.userId
      });
      expect((await serviceRequest(base, admin.cookie, 'DELETE', `/${safeService.id}`)).status).toBe(200);
      expect(await sql`SELECT id FROM "user" WHERE id = ${legitimate.userId}`).toHaveLength(0);
      expect(await sql`SELECT id FROM service_accounts WHERE id = ${safeService.id}`).toHaveLength(0);
      expect(await sql`SELECT id FROM apikey WHERE id = ${safeId}`).toHaveLength(0);
      expect(await sql`SELECT id FROM account WHERE user_id = ${legitimate.userId}`).toHaveLength(0);
      expect(await sql`SELECT id FROM session WHERE user_id = ${legitimate.userId}`).toHaveLength(0);
    });
  },
  180_000
);

it.skipIf(!enabled || process.platform === 'win32')(
  'allows safe owner deletion while protecting mismatched and reference-only cross-owner duplicates',
  async () => {
    await withBothRegistries(async (base, sql, schema) => {
      const sameOwner = await signup(base);
      const duplicateToken = newToken();
      const one = await seedKey(sql, {
        token: duplicateToken,
        userId: sameOwner.userId,
        referenceId: sameOwner.userId
      });
      const two = await seedKey(sql, {
        token: duplicateToken,
        userId: sameOwner.userId,
        referenceId: sameOwner.userId,
        enabled: false
      });
      await deleteUser(base, sameOwner.userId);
      expect(
        await sql`SELECT id FROM apikey WHERE id = ANY(${[one, two]})`,
        `${schema}: same-owner copies cascade`
      ).toHaveLength(0);
      const browserUser = await signup(base);
      const browserKey = await createBrowserKey(base, browserUser.cookie);
      expect(
        (await post(base, '/api/auth/delete-user', { password: 'local-test-password-123' }, browserUser.cookie)).status
      ).toBe(200);
      expect(await sql`SELECT id FROM "user" WHERE id = ${browserUser.userId}`).toHaveLength(0);
      expect(await sql`SELECT id FROM account WHERE user_id = ${browserUser.userId}`).toHaveLength(0);
      expect(await sql`SELECT id FROM session WHERE user_id = ${browserUser.userId}`).toHaveLength(0);
      expect(await sql`SELECT id FROM apikey WHERE id = ${browserKey.id}`).toHaveLength(0);
      const singleOwner = await signup(base);
      const singleReference = await signup(base);
      const singleToken = newToken();
      const singleId = await seedKey(sql, {
        token: singleToken,
        userId: singleOwner.userId,
        referenceId: singleReference.userId
      });
      expect((await whoami(base, singleToken)).status).toBe(401);
      await deleteUser(base, singleOwner.userId);
      expect(
        await sql`SELECT id FROM apikey WHERE id = ${singleId}`,
        `${schema}: single disputed row cascades`
      ).toHaveLength(0);
      const first = await signup(base);
      const second = await signup(base);
      const disputed = newToken();
      await seedKey(sql, { token: disputed, userId: first.userId, referenceId: second.userId });
      await seedKey(sql, { token: disputed, userId: second.userId, referenceId: second.userId });
      expect((await deleteUserResponse(base, first.userId)).status, `${schema}: mismatched owner blocked`).toBe(409);
      expect((await whoami(base, disputed)).status).toBe(401);
      const retainedOwner = await signup(base);
      const retainedOther = await signup(base);
      const retainedToken = newToken();
      await seedKey(sql, { token: retainedToken, userId: retainedOwner.userId, referenceId: retainedOwner.userId });
      const retainedId = await seedKey(sql, {
        token: retainedToken,
        userId: retainedOther.userId,
        referenceId: retainedOwner.userId
      });
      const retainedBefore = await sql`SELECT * FROM apikey WHERE id = ${retainedId}`;
      await deleteUser(base, retainedOwner.userId);
      expect(await sql`SELECT * FROM apikey WHERE id = ${retainedId}`, `${schema}: disputed evidence retained`).toEqual(
        retainedBefore
      );
      expect((await whoami(base, retainedToken)).status).toBe(401);
      if (schema === 'push-only') {
        const referenceOwner = await signup(base);
        const other = await signup(base);
        const token = newToken();
        const referenceId = await seedKey(sql, { token, userId: null, referenceId: referenceOwner.userId });
        await seedKey(sql, { token, userId: other.userId, referenceId: other.userId });
        const hash = createHash('sha256').update(token).digest('base64url');
        const before = await sql`SELECT * FROM apikey WHERE key = ${hash} ORDER BY id`;
        await deleteUser(base, referenceOwner.userId);
        expect(
          await sql`SELECT * FROM apikey WHERE key = ${hash} ORDER BY id`,
          'reference-only evidence survives'
        ).toEqual(before);
        expect(await sql`SELECT id FROM apikey WHERE id = ${referenceId}`).toHaveLength(1);
        expect((await whoami(base, token)).status).toBe(401);
        const cascaded = await signup(base);
        const survivor = await signup(base);
        const blockedToken = newToken();
        await seedKey(sql, { token: blockedToken, userId: cascaded.userId, referenceId: cascaded.userId });
        await seedKey(sql, { token: blockedToken, userId: null, referenceId: survivor.userId });
        expect((await deleteUserResponse(base, cascaded.userId)).status, 'reference-only survivor protected').toBe(409);
        const orphanOwner = await signup(base);
        const orphanToken = newToken();
        await seedKey(sql, { token: orphanToken, userId: orphanOwner.userId, referenceId: orphanOwner.userId });
        await seedKey(sql, { token: orphanToken, userId: null, referenceId: randomUUID() });
        expect(
          (await deleteUserResponse(base, orphanOwner.userId)).status,
          'orphan reference remains a distinct claim'
        ).toBe(409);
        expect((await whoami(base, orphanToken)).status).toBe(401);
        const preservedOwner = await signup(base);
        const preservedOther = await signup(base);
        const preservedToken = newToken();
        await seedKey(sql, {
          token: preservedToken,
          userId: preservedOwner.userId,
          referenceId: preservedOwner.userId
        });
        const preservedReference = await seedKey(sql, {
          token: preservedToken,
          userId: null,
          referenceId: preservedOwner.userId
        });
        await seedKey(sql, {
          token: preservedToken,
          userId: preservedOther.userId,
          referenceId: preservedOther.userId
        });
        await deleteUser(base, preservedOwner.userId);
        expect(
          await sql`SELECT id FROM apikey WHERE id = ${preservedReference}`,
          'reference-only evidence preserved'
        ).toHaveLength(1);
        expect((await whoami(base, preservedToken)).status).toBe(401);
      }
    });
  },
  180_000
);

it.skipIf(!enabled || process.platform === 'win32')(
  'revokes service-account keys only for the selected owner and never removes disputed secrets',
  async () => {
    await withBothRegistries(async (base, sql, schema) => {
      await ensureServiceAccounts(sql);
      const admin = await signupAdmin(base, sql);
      const account = await signup(base);
      const other = await signup(base);
      const [service] = await sql`INSERT INTO service_accounts (user_id, owner_user_id, display_name, disabled)
        VALUES (${account.userId}, ${admin.userId}, 'Disabled service', true) RETURNING id`;
      const foreignToken = newToken();
      const foreignId = await seedKey(sql, { token: foreignToken, userId: other.userId, referenceId: other.userId });
      const foreignBefore = await sql`SELECT * FROM apikey WHERE id = ${foreignId}`;
      expect((await serviceRequest(base, admin.cookie, 'DELETE', `/${service.id}/keys/${foreignId}`)).status).toBe(404);
      expect(await sql`SELECT * FROM apikey WHERE id = ${foreignId}`).toEqual(foreignBefore);
      const disputedToken = newToken();
      const disputedId = await seedKey(sql, {
        token: disputedToken,
        userId: account.userId,
        referenceId: account.userId
      });
      await seedKey(sql, { token: disputedToken, userId: other.userId, referenceId: other.userId });
      const hash = createHash('sha256').update(disputedToken).digest('base64url');
      const disputedBefore = await sql`SELECT * FROM apikey WHERE key = ${hash} ORDER BY id`;
      expect((await serviceRequest(base, admin.cookie, 'DELETE', `/${service.id}/keys/${disputedId}`)).status).toBe(
        404
      );
      expect(await sql`SELECT * FROM apikey WHERE key = ${hash} ORDER BY id`).toEqual(disputedBefore);
      const safeToken = newToken();
      const safeId = await seedKey(sql, { token: safeToken, userId: account.userId, referenceId: null });
      const duplicateId = await seedKey(sql, { token: safeToken, userId: account.userId, referenceId: account.userId });
      await sql`UPDATE apikey SET permissions = ${'{"skills":["read"]}'}, enabled = false WHERE id = ${duplicateId}`;
      expect(
        (await serviceRequest(base, admin.cookie, 'DELETE', `/${service.id}/keys/${safeId}`)).status,
        `${schema}: owner revoke`
      ).toBe(200);
      expect(await sql`SELECT id FROM apikey WHERE id = ANY(${[safeId, duplicateId]})`).toHaveLength(0);
      expect((await whoami(base, safeToken)).status).toBe(401);
      expect((await sql`SELECT disabled FROM service_accounts WHERE id = ${service.id}`)[0].disabled).toBe(true);
    });
  },
  180_000
);

it.skipIf(!enabled || process.platform === 'win32')(
  'serializes concurrent duplicate inserts against deletion, revocation, cleanup and verification',
  async () => {
    await withBothRegistries(async (base, sql, schema, database) => {
      await ensureServiceAccounts(sql);
      const admin = await signupAdmin(base, sql);
      for (const operation of [
        'delete-user',
        'delete-service',
        'admin-revoke',
        'revoke',
        'server-revoke',
        'update',
        'cleanup',
        'verify'
      ] as const) {
        const first = await signup(base);
        const second = await signup(base);
        const [service] =
          operation === 'delete-service' || operation === 'admin-revoke'
            ? await sql`INSERT INTO service_accounts (user_id, owner_user_id, display_name, disabled)
            VALUES (${first.userId}, ${admin.userId}, 'Concurrent service account', true) RETURNING id`
            : [];
        const key = await createBrowserKey(base, first.cookie);
        if (operation === 'cleanup')
          await sql`UPDATE apikey SET expires_at = NOW() - INTERVAL '1 hour' WHERE id = ${key.id}`;
        const before = await sql`SELECT * FROM apikey WHERE id = ${key.id}`;
        const inserting = await startUncommittedDuplicate(database, key.key, second.userId);
        let pending: Promise<Response> | undefined;
        try {
          pending =
            operation === 'delete-user'
              ? deleteUserResponse(base, first.userId)
              : operation === 'delete-service'
                ? serviceRequest(base, admin.cookie, 'DELETE', `/${service.id}`)
                : operation === 'admin-revoke'
                  ? serviceRequest(base, admin.cookie, 'DELETE', `/${service.id}/keys/${key.id}`)
                  : operation === 'revoke'
                    ? post(base, '/api/auth/api-key/delete', { keyId: key.id }, first.cookie)
                    : operation === 'server-revoke'
                      ? post(base, '/__test/delete-key', { keyId: key.id }, first.cookie)
                      : operation === 'update'
                        ? post(base, '/api/auth/api-key/update', { keyId: key.id, name: 'Raced change' }, first.cookie)
                        : operation === 'cleanup'
                          ? post(base, '/__test/cleanup-expired', {})
                          : whoami(base, key.key);
          await waitForKeyTableLock(sql);
          await inserting.commit();
          const result = await pending;
          if (operation === 'delete-user') expect(result.status, `${schema}: delete blocked`).toBe(409);
          if (operation === 'delete-service') {
            expect(result.status, `${schema}: service delete blocked`).toBe(409);
            expect(await sql`SELECT id FROM service_accounts WHERE id = ${service.id}`).toHaveLength(1);
          }
          if (operation === 'revoke' || operation === 'server-revoke' || operation === 'update') {
            expect(result.status, `${schema}: ${operation} conflict`).toBe(409);
            expect((await result.json()).code).toBe('API_KEY_OWNERSHIP_CONFLICT');
          }
          if (operation === 'admin-revoke') expect(result.status, `${schema}: admin revoke rejected`).toBe(404);
          if (operation === 'cleanup') expect(result.status).toBe(200);
          if (operation === 'verify') expect(result.status, `${schema}: verify rejected`).toBe(401);
          expect(
            await sql`SELECT * FROM apikey WHERE id = ${key.id}`,
            `${schema}: ${operation} leaves original unchanged`
          ).toEqual(before);
          expect(await sql`SELECT id FROM apikey WHERE id = ${inserting.id}`).toHaveLength(1);
          expect((await whoami(base, key.key)).status, `${schema}: shared secret remains rejected`).toBe(401);
        } finally {
          await inserting.close();
          await pending?.catch(() => undefined);
        }
      }
    });
  },
  180_000
);

it.skipIf(!enabled || process.platform === 'win32')(
  'times out a blocked verification without a later usage write after a duplicate commits',
  async () => {
    await withBothRegistries(async (base, sql, schema, database) => {
      const owner = await signup(base);
      const other = await signup(base);
      const key = await createBrowserKey(base, owner.cookie);
      const before = await sql`SELECT * FROM apikey WHERE id = ${key.id}`;
      const insertion = await startUncommittedDuplicate(database, key.key, other.userId);
      let verification: Promise<Response> | undefined;
      try {
        const start = performance.now();
        verification = whoami(base, key.key);
        await waitForKeyTableLock(sql);
        const response = await verification;
        expect(response.status, `${schema}: bounded lock wait`).toBe(503);
        expect(performance.now() - start).toBeLessThan(7_000);
        expect(await sql`SELECT * FROM apikey WHERE id = ${key.id}`).toEqual(before);
        await insertion.commit();
        expect(await sql`SELECT * FROM apikey WHERE id = ${key.id}`, `${schema}: no late write`).toEqual(before);
        expect((await whoami(base, key.key)).status, `${schema}: committed conflict stays rejected`).toBe(401);
      } finally {
        await insertion.close();
        await verification?.catch(() => undefined);
      }
    });
  },
  180_000
);

it.skipIf(!enabled || process.platform === 'win32')(
  'does not delete a user after the caller abandons a queued Better Auth deletion',
  async () => {
    await withBothRegistries(async (base, sql, schema, database) => {
      await ensureServiceAccounts(sql);
      const owner = await signup(base);
      const other = await signup(base);
      const key = await createBrowserKey(base, owner.cookie);
      const hash = createHash('sha256').update(key.key).digest('base64url');
      const before = await deletionState(sql, owner.userId, hash);
      const insertion = await startUncommittedDuplicate(database, newToken(), other.userId);
      const abort = new AbortController();
      const requestId = randomUUID();
      const request = fetch(`${base}/api/auth/delete-user`, {
        method: 'POST',
        headers: {
          Cookie: owner.cookie,
          Origin: base,
          'Content-Type': 'application/json',
          'X-Test-Request-Id': requestId
        },
        body: JSON.stringify({ password: 'local-test-password-123' }),
        signal: abort.signal
      });
      void request.catch(() => undefined);
      try {
        await waitForKeyTableLock(sql);
        abort.abort();
        await expect(request).rejects.toThrow();
        await waitForDisconnect(base, requestId);
        await insertion.commit();
        const deadline = Date.now() + 1_500;
        let after = await deletionState(sql, owner.userId, hash);
        while (Date.now() < deadline && after.user.length) {
          await new Promise((resolve) => setTimeout(resolve, 20));
          after = await deletionState(sql, owner.userId, hash);
        }
        expect(after, `${schema}: abandoned deletion left account data intact`).toEqual(before);
      } finally {
        await insertion.close();
        await request.catch(() => undefined);
      }
    });
  },
  180_000
);

it.skipIf(!enabled || process.platform === 'win32')(
  'does not delete a service account or revoke its key after the administrator disconnects',
  async () => {
    await withBothRegistries(async (base, sql, schema, database) => {
      await ensureServiceAccounts(sql);
      const admin = await signupAdmin(base, sql);
      const serviceUser = await signup(base);
      const other = await signup(base);
      const [service] = await sql`INSERT INTO service_accounts (user_id, owner_user_id, display_name, disabled)
        VALUES (${serviceUser.userId}, ${admin.userId}, 'Cancellation service', true) RETURNING id`;
      for (const operation of ['delete', 'revoke'] as const) {
        const key = await createBrowserKey(base, serviceUser.cookie);
        const hash = createHash('sha256').update(key.key).digest('base64url');
        const before = await deletionState(sql, serviceUser.userId, hash);
        const insertion = await startUncommittedDuplicate(database, newToken(), other.userId);
        const path = operation === 'delete' ? `/${service.id}` : `/${service.id}/keys/${key.id}`;
        const abort = new AbortController();
        const requestId = randomUUID();
        const request = fetch(`${base}/__test/service-accounts${path}`, {
          method: 'DELETE',
          headers: { Cookie: admin.cookie, Origin: base, 'X-Test-Request-Id': requestId },
          signal: abort.signal
        });
        void request.catch(() => undefined);
        try {
          await waitForKeyTableLock(sql);
          abort.abort();
          await expect(request).rejects.toThrow();
          await waitForDisconnect(base, requestId);
          await insertion.commit();
          const drained = await fetch(`${base}/api/auth/get-session`, {
            headers: { Cookie: admin.cookie, Origin: base }
          });
          expect(drained.status).toBe(200);
          expect(
            await deletionState(sql, serviceUser.userId, hash),
            `${schema}: abandoned ${operation} was rolled back`
          ).toEqual(before);
        } finally {
          await insertion.close();
          await request.catch(() => undefined);
        }
      }
    });
  },
  180_000
);

it.skipIf(!enabled || process.platform === 'win32')(
  'rolls back partial duplicate-key writes when PostgreSQL suppresses a row',
  async () => {
    await withBothRegistries(async (base, sql, schema) => {
      const account = await signup(base);
      const token = newToken();
      const first = await seedKey(sql, { token, userId: account.userId, referenceId: account.userId });
      const second = await seedKey(sql, { token, userId: account.userId, referenceId: account.userId });
      const hash = createHash('sha256').update(token).digest('base64url');
      const before = await sql`SELECT * FROM apikey WHERE key = ${hash} ORDER BY id`;
      await sql.unsafe(
        `CREATE FUNCTION pr492_suppress_key_row() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END $$`
      );
      await sql.unsafe(
        `CREATE TRIGGER pr492_suppress_update BEFORE UPDATE ON apikey FOR EACH ROW WHEN (OLD.id = '${second}') EXECUTE FUNCTION pr492_suppress_key_row()`
      );
      expect((await whoami(base, token)).status, `${schema}: incomplete usage update is retryable`).toBe(503);
      expect(await sql`SELECT * FROM apikey WHERE key = ${hash} ORDER BY id`).toEqual(before);
      expect((await post(base, '/api/auth/api-key/update', { keyId: first, enabled: false }, account.cookie)).ok).toBe(
        false
      );
      expect(
        await sql`SELECT * FROM apikey WHERE key = ${hash} ORDER BY id`,
        `${schema}: incomplete policy update rolled back`
      ).toEqual(before);
      await sql.unsafe('DROP TRIGGER pr492_suppress_update ON apikey');
      await sql.unsafe(
        `CREATE TRIGGER pr492_suppress_delete BEFORE DELETE ON apikey FOR EACH ROW WHEN (OLD.id = '${second}') EXECUTE FUNCTION pr492_suppress_key_row()`
      );
      expect((await post(base, '/api/auth/api-key/delete', { keyId: first }, account.cookie)).ok).toBe(false);
      expect(
        await sql`SELECT * FROM apikey WHERE key = ${hash} ORDER BY id`,
        `${schema}: incomplete revocation rolled back`
      ).toEqual(before);
    });
  },
  180_000
);

it.skipIf(!enabled || process.platform === 'win32')(
  'fails closed for unsupported API-key bulk writes instead of dropping their predicates',
  async () => {
    await withBothRegistries(async (base, sql, schema) => {
      const account = await signup(base);
      const key = await createBrowserKey(base, account.cookie);
      await sql`UPDATE apikey SET expires_at = NOW() - INTERVAL '1 hour' WHERE id = ${key.id}`;
      const before = await sql`SELECT * FROM apikey WHERE id = ${key.id}`;
      for (const operation of ['update', 'delete']) {
        expect(
          (await post(base, `/__test/unsafe-bulk/${operation}`, {})).status,
          `${schema}: unsupported ${operation}`
        ).toBe(500);
        expect(
          await sql`SELECT * FROM apikey WHERE id = ${key.id}`,
          `${schema}: ${operation} left the row intact`
        ).toEqual(before);
      }
    });
  },
  180_000
);

it.skipIf(!enabled || process.platform === 'win32')(
  'rolls back account deletion if PostgreSQL suppresses the user-row delete',
  async () => {
    await withBothRegistries(async (base, sql, schema) => {
      await ensureServiceAccounts(sql);
      const admin = await signupAdmin(base, sql);
      await sql.unsafe(
        `CREATE FUNCTION pr492_suppress_user_delete() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END $$`
      );
      for (const operation of ['user', 'service'] as const) {
        const account = await signup(base);
        const [service] =
          operation === 'service'
            ? await sql`INSERT INTO service_accounts (user_id, owner_user_id, display_name, disabled)
            VALUES (${account.userId}, ${admin.userId}, 'Rollback service', true) RETURNING id`
            : [];
        const key = await createBrowserKey(base, account.cookie);
        const hash = createHash('sha256').update(key.key).digest('base64url');
        const before = await deletionState(sql, account.userId, hash);
        expect(account.userId).toMatch(/^[a-zA-Z0-9]+$/);
        await sql.unsafe(
          `CREATE TRIGGER pr492_suppress_user BEFORE DELETE ON "user" FOR EACH ROW WHEN (OLD.id = '${account.userId}') EXECUTE FUNCTION pr492_suppress_user_delete()`
        );
        try {
          const response =
            operation === 'user'
              ? await deleteUserResponse(base, account.userId)
              : await serviceRequest(base, admin.cookie, 'DELETE', `/${service.id}`);
          expect(response.ok, `${schema}: incomplete ${operation} deletion fails`).toBe(false);
          expect(await deletionState(sql, account.userId, hash), `${schema}: ${operation} changes rolled back`).toEqual(
            before
          );
        } finally {
          await sql.unsafe('DROP TRIGGER pr492_suppress_user ON "user"');
        }
      }
    });
  },
  180_000
);

it.skipIf(!enabled || process.platform === 'win32')(
  'times out while the single connection is busy without deleting later',
  async () => {
    await withBothRegistries(async (base, sql, schema) => {
      await ensureServiceAccounts(sql);
      const account = await signup(base);
      const key = await createBrowserKey(base, account.cookie);
      const hash = createHash('sha256').update(key.key).digest('base64url');
      const before = await deletionState(sql, account.userId, hash);
      const hold = post(base, '/__test/hold-pool', {});
      try {
        await waitForHeldPool(sql);
        const deletion = await deleteUserResponse(base, account.userId);
        expect(deletion.status, `${schema}: pool acquisition timeout`).toBe(503);
        expect((await deletion.json()).code).toBe('API_KEY_LOCK_TIMEOUT');
        expect(await deletionState(sql, account.userId, hash)).toEqual(before);
        expect((await hold).status).toBe(204);
        expect((await whoami(base, key.key)).status, `${schema}: still valid after queued transaction drains`).toBe(
          200
        );
        const after = await deletionState(sql, account.userId, hash);
        expect(after.user).toEqual(before.user);
        expect(after.accounts).toEqual(before.accounts);
        expect(after.sessions).toEqual(before.sessions);
        expect(after.keys).toHaveLength(1);
      } finally {
        await hold.catch(() => undefined);
      }
    });
  },
  180_000
);

it.skipIf(!enabled || process.platform === 'win32')(
  'reports lock timeouts without invalidating keys or partially deleting accounts',
  async () => {
    await withBothRegistries(async (base, sql, schema, database) => {
      await ensureServiceAccounts(sql);
      const admin = await signupAdmin(base, sql);
      for (const operation of [
        'user',
        'service',
        'verify',
        'revoke',
        'browser-revoke',
        'browser-update',
        'server-revoke',
        'cleanup'
      ] as const) {
        const first = await signup(base);
        const second = await signup(base);
        const [service] =
          operation === 'service' || operation === 'revoke'
            ? await sql`INSERT INTO service_accounts (user_id, owner_user_id, display_name, disabled)
            VALUES (${first.userId}, ${admin.userId}, 'Timeout service account', true) RETURNING id`
            : [];
        const key = await createBrowserKey(base, first.cookie);
        const hash = createHash('sha256').update(key.key).digest('base64url');
        const before = await deletionState(sql, first.userId, hash);
        const inserting = await startUncommittedDuplicate(database, key.key, second.userId);
        try {
          const response =
            operation === 'user'
              ? await deleteUserResponse(base, first.userId)
              : operation === 'verify'
                ? await whoami(base, key.key)
                : operation === 'cleanup'
                  ? await post(base, '/__test/cleanup-expired', {})
                  : operation === 'browser-revoke' || operation === 'server-revoke'
                    ? await post(
                        base,
                        operation === 'browser-revoke' ? '/api/auth/api-key/delete' : '/__test/delete-key',
                        { keyId: key.id },
                        first.cookie
                      )
                    : operation === 'browser-update'
                      ? await post(
                          base,
                          '/api/auth/api-key/update',
                          { keyId: key.id, name: 'Timeout change' },
                          first.cookie
                        )
                      : await serviceRequest(
                          base,
                          admin.cookie,
                          'DELETE',
                          operation === 'revoke' ? `/${service.id}/keys/${key.id}` : `/${service.id}`
                        );
          expect(response.status, `${schema}: ${operation} lock timeout`).toBe(503);
          const body = (await response.json()) as { code?: string; error?: string };
          if (operation === 'verify') expect(body.error).toContain('Please retry');
          else expect(body.code).toBe('API_KEY_LOCK_TIMEOUT');
          expect(await deletionState(sql, first.userId, hash), `${schema}: ${operation} timeout is atomic`).toEqual(
            before
          );
        } finally {
          await inserting.close();
        }
      }
    });
  },
  180_000
);

it.skipIf(!enabled || process.platform === 'win32')(
  'expired-key cleanup leaves disputes, duplicate hashes and reference-only orphans intact',
  async () => {
    await withBothRegistries(async (base, sql, schema) => {
      const first = await signup(base);
      const second = await signup(base);
      const disputed = await seedKey(sql, { token: newToken(), userId: first.userId, referenceId: second.userId });
      const duplicateToken = newToken();
      const duplicate = await seedKey(sql, { token: duplicateToken, userId: first.userId, referenceId: first.userId });
      await seedKey(sql, { token: duplicateToken, userId: second.userId, referenceId: second.userId });
      const normal = await seedKey(sql, { token: newToken(), userId: first.userId, referenceId: first.userId });
      const orphan =
        schema === 'push-only'
          ? await seedKey(sql, { token: newToken(), userId: null, referenceId: first.userId })
          : null;
      if (orphan) await sql`UPDATE apikey SET reference_id = ${randomUUID()} WHERE id = ${orphan}`;
      await sql`UPDATE apikey SET expires_at = NOW() - INTERVAL '1 hour' WHERE id = ANY(${[disputed, duplicate, normal, ...(orphan ? [orphan] : [])]})`;
      const before =
        await sql`SELECT * FROM apikey WHERE id = ANY(${[disputed, duplicate, ...(orphan ? [orphan] : [])]}) ORDER BY id`;
      const cleanupResponse = await post(base, '/__test/cleanup-expired', {});
      expect(cleanupResponse.status).toBe(200);
      expect(
        await sql`SELECT * FROM apikey WHERE id = ANY(${[disputed, duplicate, ...(orphan ? [orphan] : [])]}) ORDER BY id`
      ).toEqual(before);
      expect(await sql`SELECT id FROM apikey WHERE id = ${normal}`, `${schema}: safe expired key cleaned`).toHaveLength(
        0
      );
    });
  },
  180_000
);

it.skipIf(!enabled || process.platform === 'win32')(
  'preserves legacy keys and rejects deleted owners on migrated and push-only databases',
  async () => {
    await withPrivateEnvironment(async () => {
      let fresh: OwnedTestDatabase | undefined;
      let existing: OwnedTestDatabase | undefined;
      let pushOnly: OwnedTestDatabase | undefined;
      try {
        pushOnly = await createReadyDatabase(true);
        await verifyPushOnly(pushOnly);
        fresh = await createReadyDatabase(false);
        existing = await createReadyDatabase(false);
        await verifyFresh(fresh);
        await verifyExisting(existing);
      } finally {
        await cleanup(
          [fresh, existing, pushOnly]
            .filter((database): database is OwnedTestDatabase => !!database)
            .map(closeOwnedDatabase)
        );
      }
    });
  },
  300_000
);

it.skipIf(!enabled || process.platform === 'win32')(
  'demonstrates Better Auth API-key inserts bypass database hooks and do not clean up reference-only keys',
  async () => {
    await withPrivateEnvironment(async () => {
      const database = await createReadyDatabase(true);
      try {
        await verifyDefaultHookBehavior(database);
      } finally {
        await closeOwnedDatabase(database);
      }
    });
  },
  120_000
);
