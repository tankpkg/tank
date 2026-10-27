/** Real PostgreSQL rate-window regression; see login intent C13 and E14. */
import { randomUUID } from 'node:crypto';

import postgres from 'postgres';
import { expect, it } from 'vitest';

import { createPostgresStore } from '../../../apps/registry/src/services/kv/postgres.js';

const databaseUrl = process.env.E2E_LOGIN_DATABASE_URL;

it.skipIf(!databaseUrl)('restarts an expired PostgreSQL rate-limit window at one', async () => {
  if (!databaseUrl) throw new Error('E2E_LOGIN_DATABASE_URL is required');
  const url = new URL(databaseUrl);
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    !['localhost', '127.0.0.1', '::1', '[::1]'].includes(url.hostname) ||
    !url.pathname.endsWith('_test') ||
    url.searchParams.has('host') ||
    url.searchParams.has('hostaddr')
  ) {
    throw new Error('The login store test requires a local, explicitly named test database');
  }

  const sql = postgres(databaseUrl, { max: 1 });
  const store = createPostgresStore(databaseUrl);
  const secondStore = createPostgresStore(databaseUrl);
  const key = `tank-test:email-rate:${randomUUID()}`;
  try {
    expect(await store.incr(key, 60_000)).toBe(1);
    expect(await store.incr(key, 60_000)).toBe(2);
    await sql`UPDATE kv_store SET expires_at = NOW() - INTERVAL '1 second' WHERE key = ${key}`;
    const concurrent = await Promise.all([store.incr(key, 60_000), secondStore.incr(key, 60_000)]);
    expect(concurrent.sort()).toEqual([1, 2]);
    await sql`UPDATE kv_store SET expires_at = NOW() - INTERVAL '1 second' WHERE key = ${key}`;
    expect(await store.incr(key, 60_000)).toBe(1);
    expect(await store.incr(key, 60_000)).toBe(2);
  } finally {
    await store.del(key);
    await sql.end();
  }
});
