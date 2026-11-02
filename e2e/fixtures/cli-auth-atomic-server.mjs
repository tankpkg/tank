/** Isolated HTTP fixture: real CLI auth routes, Better Auth and configured KV store. */
import { OpenAPIHono } from '@hono/zod-openapi';
import { cliAuthRoutes } from '../../apps/registry/src/api/routes/v1/cli-auth';
import { env } from '../../apps/registry/src/consts/env';
import {
  authorizeSession,
  consumeSession,
  deleteSession,
  getSession
} from '../../apps/registry/src/lib/auth/cli-store';
import { auth } from '../../apps/registry/src/lib/auth/core';
import { checkEmailRateLimit } from '../../apps/registry/src/services/email/rate-limiter';
import { getKVStore } from '../../apps/registry/src/services/kv';

// The auth DB reads process.env directly; select the real memory KV implementation
// independently so its HTTP behavior can be exercised with real Better Auth.
if (process.env.E2E_AUTH_STORE === 'memory') env.DATABASE_URL = '';

// Delay exactly one completed real store read; never fabricate or replace its value.
const kv = getKVStore();
const get = kv.get.bind(kv);
let staleBarrier;
kv.get = async (key) => {
  const value = await get(key);
  const barrier = staleBarrier;
  if (barrier && !barrier.reached && key === barrier.key) {
    barrier.reached = true;
    barrier.status = value ? JSON.parse(value).status : null;
    await barrier.wait;
  }
  return value;
};

const app = new OpenAPIHono();
app.on(['GET', 'POST'], '/api/auth/*', (c) => auth.handler(c.req.raw));
app.route('/api/v1/cli-auth', cliAuthRoutes);

app.post('/__test/arm-stale', async (c) => {
  const { sessionCode } = await c.req.json();
  let release;
  const wait = new Promise((resolve) => {
    release = resolve;
  });
  staleBarrier = { key: `cli-auth-v2:${sessionCode}`, reached: false, status: null, wait, release };
  return c.json({ success: true });
});

app.post('/__test/stale-status', (c) => c.json({ reached: !!staleBarrier?.reached, status: staleBarrier?.status }));

app.post('/__test/release-stale', (c) => {
  staleBarrier?.release();
  return c.json({ success: true });
});

app.post('/__test/authorize-stale', async (c) => {
  const { sessionCode, userId, email } = await c.req.json();
  const authorized = await authorizeSession(sessionCode, userId, { name: 'Atomic Login Test', email });
  return c.json({ authorized });
});

app.post('/__test/race-consume', async (c) => {
  const { sessionCode, state } = await c.req.json();
  const results = await Promise.all(Array.from({ length: 16 }, () => consumeSession(sessionCode, state)));
  return c.json({ successes: results.filter(Boolean).length });
});

app.post('/__test/legacy-session', async (c) => {
  const { state, userId, email, status, sessionCode: requestedSessionCode } = await c.req.json();
  const sessionCode = requestedSessionCode ?? crypto.randomUUID();
  const session = { state, status, createdAt: Date.now() };
  if (status === 'authorized') Object.assign(session, { userId, userName: 'Atomic Login Test', userEmail: email });
  await getKVStore().set(`cli-auth:${sessionCode}`, JSON.stringify(session), 300_000);
  return c.json({ sessionCode });
});

app.post('/__test/email-rate', async (c) => {
  const { email } = await c.req.json();
  return c.json(await checkEmailRateLimit(email));
});

app.post('/__test/expire', async (c) => {
  const { sessionCode, ttlMs = 25 } = await c.req.json();
  const session = await getSession(sessionCode);
  if (!session) return c.json({ error: 'missing session' }, 404);
  await getKVStore().set(`cli-auth-v2:${sessionCode}`, JSON.stringify(session), ttlMs);
  return c.json({ success: true });
});

app.post('/__test/session-status', async (c) => {
  const { sessionCode } = await c.req.json();
  const session = await getSession(sessionCode);
  return c.json({ status: session?.status ?? null });
});

app.post('/__test/cleanup', async (c) => {
  const { codes } = await c.req.json();
  await Promise.all(codes.map(deleteSession));
  return c.json({ success: true });
});

const server = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: app.fetch });
const base = `http://127.0.0.1:${server.port}`;
process.env.APP_URL = base;
process.env.BETTER_AUTH_URL = base;
process.stdout.write(`ATOMIC_TEST_SERVER=${base}\n`);
