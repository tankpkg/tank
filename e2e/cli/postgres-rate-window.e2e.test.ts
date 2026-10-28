/** Real PostgreSQL expiry and row-lock regression; login intent C13 and C16. */
import { randomUUID } from 'node:crypto';
import { connect, createServer, type Socket } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';

import postgres from 'postgres';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { createPostgresStore } from '../../apps/registry/src/services/kv/postgres';
import {
  blockedWriterPids,
  isolatedAuthDatabaseUrl,
  openVerifiedAuthDatabase,
  withVerifiedAuthDatabase
} from '../fixtures/auth-isolation';
import {
  assertOwnedTestDatabase,
  createOwnedTestDatabase,
  type OwnedTestDatabase,
  runTestDocker,
  validateTestDatabaseUrl,
  verifyTestDatabase,
  withoutAmbientPostgres
} from '../helpers/isolated-test-database';

let ownedDatabase: OwnedTestDatabase;

function namedStore(databaseUrl: string, applicationName: string): ReturnType<typeof createPostgresStore> {
  return withoutAmbientPostgres(() => createPostgresStore(databaseUrl), applicationName);
}
beforeAll(async () => {
  if (process.env.E2E_ATOMIC_LOGIN !== '1') return;
  isolatedAuthDatabaseUrl();
  ownedDatabase = await createOwnedTestDatabase();
}, 360_000);
afterAll(async () => {
  if (ownedDatabase) await ownedDatabase.close();
}, 40_000);

it.skipIf(process.env.E2E_ATOMIC_LOGIN !== '1')(
  'rejects a switchable local proxy even when both real servers have the same database name',
  async () => {
    const otherDatabase = await createOwnedTestDatabase(false, ownedDatabase);
    let targetPort = Number(new URL(ownedDatabase.url).port);
    const sockets = new Set<Socket>();
    const proxy = createServer((client) => {
      const upstream = connect({ host: '127.0.0.1', port: targetPort });
      sockets.add(client);
      sockets.add(upstream);
      client.once('close', () => sockets.delete(client));
      upstream.once('close', () => sockets.delete(upstream));
      client.on('error', () => upstream.destroy());
      upstream.on('error', () => client.destroy());
      client.pipe(upstream).pipe(client);
    });
    let sql: postgres.Sql | undefined;
    try {
      sql = await openVerifiedAuthDatabase(ownedDatabase);
      await new Promise<void>((resolve, reject) => {
        proxy.once('error', reject);
        proxy.listen(0, '127.0.0.1', resolve);
      });
      const address = proxy.address();
      if (!address || typeof address === 'string') throw new Error('Proxy did not bind locally');
      const proxyUrl = new URL(ownedDatabase.url);
      proxyUrl.port = String(address.port);
      const expectedName = validateTestDatabaseUrl(proxyUrl.toString());
      const first = withoutAmbientPostgres(() => postgres(proxyUrl.toString(), { max: 1, connect_timeout: 3 }));
      let firstId: string;
      try {
        await verifyTestDatabase(first, expectedName);
        const rows = await first<{ id: string }[]>`SELECT system_identifier::text AS id FROM pg_control_system()`;
        firstId = rows[0].id;
      } finally {
        await first.end({ timeout: 3 });
      }
      targetPort = Number(new URL(otherDatabase.url).port);
      const second = withoutAmbientPostgres(() => postgres(proxyUrl.toString(), { max: 1, connect_timeout: 3 }));
      try {
        await verifyTestDatabase(second, expectedName);
        const rows = await second<{ id: string }[]>`SELECT system_identifier::text AS id FROM pg_control_system()`;
        expect(rows[0].id).not.toBe(firstId);
      } finally {
        await second.end({ timeout: 3 });
      }
      expect(() => assertOwnedTestDatabase(ownedDatabase, proxyUrl.toString())).toThrow(/owned test PostgreSQL/i);
      const forged = { ...ownedDatabase, url: proxyUrl.toString() };
      await expect(openVerifiedAuthDatabase(forged)).rejects.toThrow(/owned test PostgreSQL/i);
      let cleanupCalled = false;
      await expect(
        withVerifiedAuthDatabase(sql, forged, async () => {
          cleanupCalled = true;
        })
      ).rejects.toThrow(/owned test PostgreSQL/i);
      expect(cleanupCalled).toBe(false);
    } finally {
      try {
        if (sql) await sql.end({ timeout: 3 });
        for (const socket of sockets) socket.destroy();
        if (proxy.listening) {
          await new Promise<void>((resolve, reject) => proxy.close((error) => (error ? reject(error) : resolve())));
        }
      } finally {
        await otherDatabase.close();
      }
    }
  },
  360_000
);

it.skipIf(process.env.E2E_ATOMIC_LOGIN !== '1')(
  'keeps the PostgreSQL port reserved after its owned container stops',
  async () => {
    const stopped = await createOwnedTestDatabase(false, ownedDatabase);
    const sockets = new Set<Socket>();
    const impostor = createServer((client) => {
      const upstream = connect({ host: '127.0.0.1', port: Number(new URL(ownedDatabase.url).port) });
      sockets.add(client);
      sockets.add(upstream);
      client.once('close', () => sockets.delete(client));
      upstream.once('close', () => sockets.delete(upstream));
      client.on('error', () => upstream.destroy());
      upstream.on('error', () => client.destroy());
      client.pipe(upstream).pipe(client);
    });
    const table = `tank_rebind_${randomUUID().replaceAll('-', '')}`;
    let observer: postgres.Sql | undefined;
    let writer: postgres.Sql | undefined;
    let tableCreated = false;
    try {
      observer = await openVerifiedAuthDatabase(ownedDatabase);
      await observer`CREATE TABLE ${observer(table)} (value text NOT NULL)`;
      tableCreated = true;
      const guard = await openVerifiedAuthDatabase(stopped);
      await guard.end({ timeout: 3 });
      await runTestDocker(['stop', stopped.containerId], 30_000);
      const port = Number(new URL(stopped.url).port);
      const bindError = await new Promise<NodeJS.ErrnoException | null>((resolve) => {
        impostor.once('error', resolve);
        impostor.listen(port, '127.0.0.1', () => resolve(null));
      });
      writer = withoutAmbientPostgres(() => postgres(stopped.url, { max: 1, connect_timeout: 3 }));
      if (bindError) {
        expect(bindError.code).toBe('EADDRINUSE');
      }
      const attempt = Promise.resolve(
        writer`INSERT INTO ${writer(table)} (value) VALUES ('unexpected-substitute-write')`
      ).then(
        () => 'written',
        () => 'rejected'
      );
      const outcome = await Promise.race([attempt, delay(3_000).then(() => 'timed-out')]);
      expect(bindError?.code).toBe('EADDRINUSE');
      expect(outcome).not.toBe('written');
      const rows = await observer`SELECT count(*)::int AS count FROM ${observer(table)}`;
      expect(rows[0].count).toBe(0);
    } finally {
      try {
        if (writer) await writer.end({ timeout: 3 });
        for (const socket of sockets) socket.destroy();
        if (impostor.listening) await new Promise<void>((resolve) => impostor.close(() => resolve()));
        if (observer) {
          try {
            if (tableCreated) await observer`DROP TABLE ${observer(table)}`;
          } finally {
            await observer.end({ timeout: 3 });
          }
        }
      } finally {
        await stopped.close();
      }
    }
  },
  360_000
);

it.skipIf(process.env.E2E_ATOMIC_LOGIN !== '1')(
  'distinguishes the target lock waiter from an unrelated blocked writer',
  async () => {
    const sql = await openVerifiedAuthDatabase(ownedDatabase, 5);
    const store = withoutAmbientPostgres(() => createPostgresStore(ownedDatabase.url));
    const key = `tank-test:target:${randomUUID()}`;
    const otherKey = `tank-test:other:${randomUUID()}`;
    const applicationName = `atomic-counterexample-${randomUUID()}`;
    await withVerifiedAuthDatabase(sql, ownedDatabase, async () => {
      await store.incr(key, 60_000);
      await store.incr(otherKey, 60_000);
    });
    const targetHolder = await sql.reserve();
    const otherHolder = await sql.reserve();
    const targetWaiter = await sql.reserve();
    const otherWaiter = await sql.reserve();
    let targetLocked = false;
    let otherLocked = false;
    let targetUpdate: Promise<void> | undefined;
    let otherUpdate: Promise<void> | undefined;
    try {
      const [{ pid: targetHolderPid }] = await targetHolder<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
      const [{ pid: otherHolderPid }] = await otherHolder<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
      const [{ pid: targetWaiterPid }] = await targetWaiter<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
      const [{ pid: otherWaiterPid }] = await otherWaiter<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
      await targetWaiter`SELECT set_config('application_name', ${applicationName}, false)`;
      await otherWaiter`SELECT set_config('application_name', ${applicationName}, false)`;
      await targetHolder`BEGIN`;
      targetLocked = true;
      await otherHolder`BEGIN`;
      otherLocked = true;
      await targetHolder`SELECT key FROM kv_store WHERE key = ${key} FOR UPDATE`;
      await otherHolder`SELECT key FROM kv_store WHERE key = ${otherKey} FOR UPDATE`;
      otherUpdate = (async () => {
        await otherWaiter`UPDATE kv_store SET value = value WHERE key = ${otherKey}`;
      })();
      await expect
        .poll(() => blockedWriterPids(sql, applicationName, otherHolderPid), { timeout: 6_000 })
        .toEqual([otherWaiterPid]);
      expect(await blockedWriterPids(sql, applicationName, targetHolderPid)).toEqual([]);
      targetUpdate = (async () => {
        await targetWaiter`UPDATE kv_store SET value = value WHERE key = ${key}`;
      })();
      await expect
        .poll(() => blockedWriterPids(sql, applicationName, targetHolderPid), { timeout: 6_000 })
        .toEqual([targetWaiterPid]);
    } finally {
      if (targetLocked) await targetHolder`ROLLBACK`;
      if (otherLocked) await otherHolder`ROLLBACK`;
      await Promise.allSettled([targetUpdate, otherUpdate]);
      targetHolder.release();
      otherHolder.release();
      targetWaiter.release();
      otherWaiter.release();
      try {
        await withVerifiedAuthDatabase(sql, ownedDatabase, async () => {
          await store.del(key);
          await store.del(otherKey);
        });
      } finally {
        await sql.end({ timeout: 3 });
      }
    }
  },
  30_000
);

it.skipIf(process.env.E2E_ATOMIC_LOGIN !== '1')(
  'starts a full PostgreSQL rate window after waiting on the expired row',
  async () => {
    const databaseUrl = ownedDatabase.url;
    const sql = await openVerifiedAuthDatabase(ownedDatabase, 2);
    const applicationName = `atomic-rate-${randomUUID()}`;
    const store = namedStore(databaseUrl, applicationName);
    const key = `tank-test:email-rate:${randomUUID()}`;
    const ttlMs = 1_200;
    let locked = false;
    let increment: Promise<PromiseSettledResult<number>[]> | undefined;
    const connection = await sql.reserve();
    try {
      const [{ pid: holderPid }] = await connection<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
      expect(await withVerifiedAuthDatabase(sql, ownedDatabase, () => store.incr(key, 60_000))).toBe(1);
      await withVerifiedAuthDatabase(sql, ownedDatabase, async () => {
        await sql`UPDATE kv_store SET expires_at = clock_timestamp() - interval '1 second' WHERE key = ${key}`;
      });
      await connection`BEGIN`;
      locked = true;
      expect(await connection`SELECT key FROM kv_store WHERE key = ${key} FOR UPDATE`).toHaveLength(1);
      increment = Promise.allSettled([withVerifiedAuthDatabase(sql, ownedDatabase, () => store.incr(key, ttlMs))]);
      await expect
        .poll(
          async () => {
            return (await blockedWriterPids(sql, applicationName, holderPid)).length;
          },
          { timeout: 6_000, interval: 50 }
        )
        .toBe(1);
      // Wait longer than the rate window, but less than the counter's 5s deadline.
      const [{ started }] = await sql<{ started: string }[]>`SELECT clock_timestamp()::text AS started`;
      await sql`SELECT pg_sleep(${(ttlMs + 500) / 1_000})`;
      const [{ elapsed }] = await sql<{ elapsed: number }[]>`
        SELECT EXTRACT(EPOCH FROM (clock_timestamp() - ${started}::timestamptz))::double precision * 1000 AS elapsed
      `;
      expect(elapsed).toBeGreaterThan(ttlMs);
      const [{ released }] = await connection<{ released: string }[]>`SELECT clock_timestamp()::text AS released`;
      await connection`COMMIT`;
      locked = false;
      const [result] = await increment;
      if (result.status === 'rejected') throw result.reason;
      expect(result.value).toBe(1);
      const [window] = await sql<{ full: boolean }[]>`
        SELECT expires_at >= ${released}::timestamptz + ${ttlMs}::double precision * interval '1 millisecond' AS full
        FROM kv_store WHERE key = ${key}
      `;
      expect(window.full).toBe(true);
      expect(await withVerifiedAuthDatabase(sql, ownedDatabase, () => store.incr(key, ttlMs))).toBe(2);
    } finally {
      try {
        if (locked) await connection`ROLLBACK`;
        if (increment) await increment;
      } finally {
        connection.release();
        try {
          await withVerifiedAuthDatabase(sql, ownedDatabase, () => store.del(key));
        } finally {
          await sql.end({ timeout: 3 });
        }
      }
    }
  },
  40_000
);

it.skipIf(process.env.E2E_ATOMIC_LOGIN !== '1')(
  'does not write a PostgreSQL counter after its deadline while the row is locked',
  async () => {
    const sql = await openVerifiedAuthDatabase(ownedDatabase, 2);
    const applicationName = `atomic-rate-deadline-${randomUUID()}`;
    const store = namedStore(ownedDatabase.url, applicationName);
    const key = `tank-test:email-rate:${randomUUID()}`;
    const connection = await sql.reserve();
    let locked = false;
    let increment: Promise<PromiseSettledResult<number>[]> | undefined;
    try {
      const [{ pid: holderPid }] = await connection<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
      expect(await withVerifiedAuthDatabase(sql, ownedDatabase, () => store.incr(key, 60_000))).toBe(1);
      await withVerifiedAuthDatabase(sql, ownedDatabase, async () => {
        await sql`UPDATE kv_store SET expires_at = clock_timestamp() - interval '1 second' WHERE key = ${key}`;
      });
      await connection`BEGIN`;
      locked = true;
      expect(await connection`SELECT key FROM kv_store WHERE key = ${key} FOR UPDATE`).toHaveLength(1);
      increment = Promise.allSettled([withVerifiedAuthDatabase(sql, ownedDatabase, () => store.incr(key, 10_000))]);
      await expect
        .poll(() => blockedWriterPids(sql, applicationName, holderPid), { timeout: 4_000, interval: 50 })
        .toHaveLength(1);
      const [result] = await increment;
      expect(result.status).toBe('rejected');
      if (result.status !== 'rejected') throw new Error('Counter unexpectedly succeeded while its row was locked');
      expect(result.reason).toMatchObject({ code: 'COUNTER_DEADLINE_EXCEEDED' });
      const [row] = await connection<{ value: string; expired: boolean }[]>`
        SELECT value, expires_at <= clock_timestamp() AS expired FROM kv_store WHERE key = ${key}
      `;
      expect(row).toEqual({ value: '1', expired: true });
      await connection`COMMIT`;
      locked = false;
      await sql`SELECT pg_sleep(0.3)`;
      const [afterRelease] = await sql<{ value: string; expired: boolean }[]>`
        SELECT value, expires_at <= clock_timestamp() AS expired FROM kv_store WHERE key = ${key}
      `;
      expect(afterRelease).toEqual({ value: '1', expired: true });
      expect(await withVerifiedAuthDatabase(sql, ownedDatabase, () => store.incr(key, 10_000))).toBe(1);
    } finally {
      try {
        if (locked) await connection`ROLLBACK`;
        if (increment) await increment;
      } finally {
        connection.release();
        try {
          await withVerifiedAuthDatabase(sql, ownedDatabase, () => store.del(key));
        } finally {
          await sql.end({ timeout: 3 });
        }
      }
    }
  },
  40_000
);

it.skipIf(process.env.E2E_ATOMIC_LOGIN !== '1')(
  'starts one shared rate window for concurrent PostgreSQL instances',
  async () => {
    const databaseUrl = ownedDatabase.url;
    const sql = await openVerifiedAuthDatabase(ownedDatabase);
    const stores = withoutAmbientPostgres(() => [createPostgresStore(databaseUrl), createPostgresStore(databaseUrl)]);
    const key = `tank-test:email-rate:${randomUUID()}`;
    try {
      expect(await withVerifiedAuthDatabase(sql, ownedDatabase, () => stores[0].incr(key, 60_000))).toBe(1);
      await withVerifiedAuthDatabase(sql, ownedDatabase, () => stores[1].get(key));
      await withVerifiedAuthDatabase(sql, ownedDatabase, async () => {
        await sql`UPDATE kv_store SET expires_at = clock_timestamp() - interval '1 second' WHERE key = ${key}`;
      });
      const counts = await withVerifiedAuthDatabase(sql, ownedDatabase, () =>
        Promise.all(Array.from({ length: 16 }, (_, index) => stores[index % 2].incr(key, 60_000)))
      );
      expect(counts.sort((left, right) => left - right)).toEqual(Array.from({ length: 16 }, (_, index) => index + 1));
    } finally {
      try {
        await withVerifiedAuthDatabase(sql, ownedDatabase, () => stores[0].del(key));
      } finally {
        await sql.end({ timeout: 3 });
      }
    }
  },
  20_000
);

it.skipIf(process.env.E2E_ATOMIC_LOGIN !== '1')(
  'rejects an unbound client before writing or deleting fixtures',
  async () => {
    const databaseUrl = ownedDatabase.url;
    const sql = await openVerifiedAuthDatabase(ownedDatabase);
    const unboundSql = withoutAmbientPostgres(() => postgres(databaseUrl, { max: 1, connect_timeout: 3 }));
    const store = withoutAmbientPostgres(() => createPostgresStore(databaseUrl));
    const key = `tank-test:guard:${randomUUID()}`;
    const blockedKey = `${key}:blocked`;
    try {
      expect(await withVerifiedAuthDatabase(sql, ownedDatabase, () => store.incr(key, 60_000))).toBe(1);
      await expect(
        withVerifiedAuthDatabase(unboundSql, ownedDatabase, () => store.incr(blockedKey, 60_000))
      ).rejects.toThrow('SQL connection is not bound');
      await expect(
        withVerifiedAuthDatabase(unboundSql, ownedDatabase, async () => {
          await sql`DELETE FROM kv_store WHERE key = ${key}`;
        })
      ).rejects.toThrow('SQL connection is not bound');
      const rows = await sql`SELECT key FROM kv_store WHERE key = ${key}`;
      expect(rows).toHaveLength(1);
      const blocked = await sql`SELECT key FROM kv_store WHERE key = ${blockedKey}`;
      expect(blocked).toHaveLength(0);
    } finally {
      try {
        await withVerifiedAuthDatabase(sql, ownedDatabase, () => store.del(key));
      } finally {
        await unboundSql.end({ timeout: 3 });
        await sql.end({ timeout: 3 });
      }
    }
  },
  20_000
);

it.skipIf(process.env.E2E_ATOMIC_LOGIN !== '1')(
  'does not write or clean up when verification of a bound database connection fails',
  async () => {
    const sql = await openVerifiedAuthDatabase(ownedDatabase);
    const store = withoutAmbientPostgres(() => createPostgresStore(ownedDatabase.url));
    const key = `tank-test:bound-guard:${randomUUID()}`;
    const blockedKey = `${key}:blocked`;
    let closedSql: postgres.Sql | undefined;
    try {
      closedSql = await openVerifiedAuthDatabase(ownedDatabase);
      expect(await withVerifiedAuthDatabase(sql, ownedDatabase, () => store.incr(key, 60_000))).toBe(1);
      await closedSql.end({ timeout: 3 });
      await expect(
        withVerifiedAuthDatabase(closedSql, ownedDatabase, () => store.incr(blockedKey, 60_000))
      ).rejects.toMatchObject({ code: 'CONNECTION_ENDED' });
      await expect(
        withVerifiedAuthDatabase(closedSql, ownedDatabase, async () => {
          await sql`DELETE FROM kv_store WHERE key = ${key}`;
        })
      ).rejects.toMatchObject({ code: 'CONNECTION_ENDED' });
      const existing = await sql`SELECT key FROM kv_store WHERE key = ${key}`;
      const blocked = await sql`SELECT key FROM kv_store WHERE key = ${blockedKey}`;
      expect(existing).toHaveLength(1);
      expect(blocked).toHaveLength(0);
    } finally {
      try {
        await withVerifiedAuthDatabase(sql, ownedDatabase, () => store.del(key));
      } finally {
        if (closedSql) await closedSql.end({ timeout: 3 });
        await sql.end({ timeout: 3 });
      }
    }
  },
  20_000
);
