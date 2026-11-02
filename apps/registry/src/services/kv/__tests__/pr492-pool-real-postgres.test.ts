// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type OwnedServices, startOwnedServices } from './pr492-owned-services';

describe.skipIf(process.env.PR492_ISOLATED_CONFIG !== '1')('PostgreSQL KV connection isolation', () => {
  let services: OwnedServices;
  beforeAll(async () => {
    services = await startOwnedServices('postgres');
  }, 180_000);
  afterAll(async () => {
    if (services) await services.close();
  }, 180_000);

  it('does not queue an auth write behind a locked email counter', async () => {
    const script = `
      import { randomUUID } from 'node:crypto';
      import postgres from 'postgres';
      import { createPostgresStore } from './src/services/kv/postgres.ts';

      async function main() {
        const original = new URL(process.env.DATABASE_URL);
        const admin = postgres(original.toString(), { max: 1, prepare: false });
        const monitor = postgres(original.toString(), { max: 1, prepare: false });
        const id = randomUUID();
        const name = 'pr492-' + id;
        const keys = ['review:' + id + ':warm', 'review:' + id + ':auth'];
        const isolated = new URL(original);
        isolated.searchParams.set('application_name', name);
        const store = createPostgresStore(isolated.toString());
        let release = () => {};
        let holder;
        try {
          await store.incr(keys[0], 60_000);
          let locked;
          const lockedRow = new Promise((resolve) => { locked = resolve; });
          const released = new Promise((resolve) => { release = resolve; });
          holder = admin.begin(async (tx) => {
            await tx.unsafe('SELECT key FROM kv_store WHERE key = $1 FOR UPDATE', [keys[0]]);
            locked();
            await released;
          });
          await lockedRow;
          const counter = store.incr(keys[0], 60_000);
          let waiting = false;
          for (let attempt = 0; attempt < 100 && !waiting; attempt++) {
            const rows = await monitor.unsafe("SELECT count(*)::int AS waiting FROM pg_stat_activity WHERE application_name = $1 AND wait_event_type = 'Lock'", [name]);
            waiting = rows[0].waiting > 0;
            if (!waiting) await new Promise((resolve) => setTimeout(resolve, 50));
          }
          if (!waiting) throw Error('counter did not wait for the row lock');
          const started = performance.now();
          const write = store.set(keys[1], 'review-pending', 60_000)
            .then(() => true);
          const authWhileLocked = await Promise.race([write, new Promise((resolve) => setTimeout(() => resolve(false), 5_000))]);
          const elapsed = performance.now() - started;
          release();
          await holder;
          const value = await counter;
          await write;
          const rows = await admin.unsafe('SELECT count(*)::int AS connections FROM pg_stat_activity WHERE application_name = $1', [name]);
          console.log(JSON.stringify({ elapsed, authWhileLocked, connections: rows[0].connections, value }));
        } finally {
          release();
          if (holder) await holder;
          await monitor.end();
          await admin.end();
        }
      }
      main().then(() => process.exit(0), (error) => { console.error(error); process.exit(1); });
    `;
    const { stdout } = await services.runBun(script);
    const result = JSON.parse(stdout.trim().split('\n').at(-1) ?? '') as {
      elapsed: number;
      authWhileLocked: boolean;
      connections: number;
      value: number;
    };
    expect(result.authWhileLocked).toBe(true);
    expect(result.connections).toBe(2);
    expect(result.value).toBe(2);
  }, 75_000);

  it('lets an unrelated counter proceed while the same store has a locked, contended counter', async () => {
    const script = `
      import { randomUUID } from 'node:crypto';
      import postgres from 'postgres';
      import { createPostgresStore } from './src/services/kv/postgres.ts';

      async function main() {
        const original = new URL(process.env.DATABASE_URL);
        const admin = postgres(original.toString(), { max: 1, prepare: false });
        const monitor = postgres(original.toString(), { max: 1, prepare: false });
        const id = randomUUID();
        const name = 'pr492-counters-' + id;
        const blockedKey = 'review:' + id + ':blocked';
        const freeKey = 'review:' + id + ':free';
        const isolated = new URL(original);
        isolated.searchParams.set('application_name', name);
        const store = createPostgresStore(isolated.toString());
        let release = () => {};
        let holder;
        try {
          await store.incr(blockedKey, 60_000);
          let locked;
          const lockedRow = new Promise((resolve) => { locked = resolve; });
          const released = new Promise((resolve) => { release = resolve; });
          holder = admin.begin(async (tx) => {
            await tx.unsafe('SELECT key FROM kv_store WHERE key = $1 FOR UPDATE', [blockedKey]);
            locked();
            await released;
          });
          await lockedRow;
          const blocked = Promise.all(Array.from({ length: 32 }, () => store.incr(blockedKey, 60_000)));
          void blocked.catch(() => {});
          let waiting = false;
          for (let attempt = 0; attempt < 100 && !waiting; attempt++) {
            const rows = await monitor.unsafe("SELECT count(*)::int AS waiting FROM pg_stat_activity WHERE application_name = $1 AND wait_event_type = 'Lock'", [name]);
            waiting = rows[0].waiting > 0;
            if (!waiting) await new Promise((resolve) => setTimeout(resolve, 50));
          }
          if (!waiting) throw Error('counter did not wait for the row lock');
          const free = Promise.all(Array.from({ length: 8 }, () => store.incr(freeKey, 60_000)));
          void free.catch(() => {});
          const unrelatedWhileLocked = await Promise.race([
            free.then(() => true),
            new Promise((resolve) => setTimeout(() => resolve(false), 3_000))
          ]);
          const connections = await monitor.unsafe('SELECT count(*)::int AS count FROM pg_stat_activity WHERE application_name = $1', [name]);
          release();
          await holder;
          const blockedValues = (await blocked).sort((a, b) => a - b);
          const freeValues = (await free).sort((a, b) => a - b);
          console.log(JSON.stringify({ unrelatedWhileLocked, connections: connections[0].count, blockedValues, freeValues }));
        } finally {
          release();
          if (holder) await holder;
          await monitor.end();
          await admin.end();
        }
      }
      main().then(() => process.exit(0), (error) => { console.error(error); process.exit(1); });
    `;
    const { stdout } = await services.runBun(script);
    const result = JSON.parse(stdout.trim().split('\n').at(-1) ?? '') as {
      unrelatedWhileLocked: boolean;
      connections: number;
      blockedValues: number[];
      freeValues: number[];
    };
    expect(result.unrelatedWhileLocked).toBe(true);
    expect(result.connections).toBeLessThanOrEqual(3);
    expect(result.blockedValues).toEqual(Array.from({ length: 32 }, (_, index) => index + 2));
    expect(result.freeValues).toEqual(Array.from({ length: 8 }, (_, index) => index + 1));
  }, 75_000);

  it('releases pool capacity while two different counter rows remain locked', async () => {
    const script = `
      import { randomUUID } from 'node:crypto';
      import postgres from 'postgres';
      import { createPostgresStore } from './src/services/kv/postgres.ts';

      async function main() {
        const original = new URL(process.env.DATABASE_URL);
        const admin = postgres(original.toString(), { max: 1, prepare: false });
        const monitor = postgres(original.toString(), { max: 1, prepare: false });
        const id = randomUUID();
        const name = 'pr492-saturation-' + id;
        const keys = ['review:' + id + ':first', 'review:' + id + ':second', 'review:' + id + ':free'];
        const isolated = new URL(original);
        isolated.searchParams.set('application_name', name);
        const store = createPostgresStore(isolated.toString());
        let release = () => {};
        let holder;
        try {
          await Promise.all(keys.slice(0, 2).map((key) => store.incr(key, 2_000)));
          let locked;
          const lockedRows = new Promise((resolve) => { locked = resolve; });
          const released = new Promise((resolve) => { release = resolve; });
          holder = admin.begin(async (tx) => {
            for (const key of keys.slice(0, 2)) {
              await tx.unsafe('SELECT key FROM kv_store WHERE key = $1 FOR UPDATE', [key]);
            }
            locked();
            await released;
          });
          await lockedRows;
          const blocked = Promise.all(keys.slice(0, 2).map((key) => store.incr(key, 2_000)));
          void blocked.catch(() => {});
          let waiting = 0;
          for (let attempt = 0; attempt < 100 && waiting < 2; attempt++) {
            const rows = await monitor.unsafe("SELECT count(*)::int AS waiting FROM pg_stat_activity WHERE application_name = $1 AND wait_event_type = 'Lock'", [name]);
            waiting = rows[0].waiting;
            if (waiting < 2) await new Promise((resolve) => setTimeout(resolve, 50));
          }
          if (waiting < 2) throw Error('both counter connections did not wait for row locks');
          // Hold both rows longer than the original window and multiple lock
          // timeouts. Retried increments must start a fresh window after release.
          await new Promise((resolve) => setTimeout(resolve, 2_250));
          const free = store.incr(keys[2], 60_000);
          void free.catch(() => {});
          const unrelatedWhileLocked = await Promise.race([
            free.then(() => true),
            new Promise((resolve) => setTimeout(() => resolve(false), 3_000))
          ]);
          const connections = await monitor.unsafe('SELECT count(*)::int AS count FROM pg_stat_activity WHERE application_name = $1', [name]);
          release();
          await holder;
          const blockedValues = await blocked;
          const nextValues = await Promise.all(keys.slice(0, 2).map((key) => store.incr(key, 2_000)));
          const freeValue = await free;
          console.log(JSON.stringify({ unrelatedWhileLocked, connections: connections[0].count, blockedValues, nextValues, freeValue }));
        } finally {
          release();
          if (holder) await holder;
          await monitor.end();
          await admin.end();
        }
      }
      main().then(() => process.exit(0), (error) => { console.error(error); process.exit(1); });
    `;
    const { stdout } = await services.runBun(script);
    const result = JSON.parse(stdout.trim().split('\n').at(-1) ?? '') as {
      unrelatedWhileLocked: boolean;
      connections: number;
      blockedValues: number[];
      nextValues: number[];
      freeValue: number;
    };
    expect(result.unrelatedWhileLocked).toBe(true);
    expect(result.connections).toBeLessThanOrEqual(3);
    expect(result.blockedValues).toEqual([1, 1]);
    expect(result.nextValues).toEqual([2, 2]);
    expect(result.freeValue).toBe(1);
  }, 75_000);

  it('retries a conflicting insert that rolls back without aging the new window', async () => {
    const script = `
      import { randomUUID } from 'node:crypto';
      import postgres from 'postgres';
      import { createPostgresStore } from './src/services/kv/postgres.ts';

      async function main() {
        const original = new URL(process.env.DATABASE_URL);
        const admin = postgres(original.toString(), { max: 1, prepare: false });
        const monitor = postgres(original.toString(), { max: 1, prepare: false });
        const id = randomUUID();
        const name = 'pr492-insert-' + id;
        const key = 'review:' + id + ':new';
        const isolated = new URL(original);
        isolated.searchParams.set('application_name', name);
        const store = createPostgresStore(isolated.toString());
        let release = () => {};
        let holder;
        try {
          await store.incr('review:' + id + ':warm', 60_000);
          let inserted;
          const insertedRow = new Promise((resolve) => { inserted = resolve; });
          const released = new Promise((resolve) => { release = resolve; });
          holder = admin.begin(async (tx) => {
            await tx.unsafe("INSERT INTO kv_store (key, value, expires_at) VALUES ($1, '9', clock_timestamp() + interval '1 minute')", [key]);
            inserted();
            await released;
            throw Error('expected rollback');
          }).catch((error) => { if (error.message !== 'expected rollback') throw error; });
          await insertedRow;
          const first = store.incr(key, 2_000);
          void first.catch(() => {});
          let waiting = false;
          for (let attempt = 0; attempt < 100 && !waiting; attempt++) {
            const rows = await monitor.unsafe("SELECT count(*)::int AS waiting FROM pg_stat_activity WHERE application_name = $1 AND wait_event_type = 'Lock'", [name]);
            waiting = rows[0].waiting > 0;
            if (!waiting) await new Promise((resolve) => setTimeout(resolve, 50));
          }
          if (!waiting) throw Error('insert did not wait for the conflicting transaction');
          await new Promise((resolve) => setTimeout(resolve, 2_250));
          release();
          await holder;
          const firstValue = await first;
          const before = await monitor.unsafe('SELECT expires_at::text AS expiry FROM kv_store WHERE key = $1', [key]);
          const secondValue = await store.incr(key, 2_000);
          const after = await monitor.unsafe('SELECT expires_at::text AS expiry FROM kv_store WHERE key = $1', [key]);
          console.log(JSON.stringify({ firstValue, secondValue, expiryPreserved: before[0].expiry === after[0].expiry }));
        } finally {
          release();
          if (holder) await holder;
          await monitor.end();
          await admin.end();
        }
      }
      main().then(() => process.exit(0), (error) => { console.error(error); process.exit(1); });
    `;
    const { stdout } = await services.runBun(script);
    const result = JSON.parse(stdout.trim().split('\n').at(-1) ?? '') as {
      firstValue: number;
      secondValue: number;
      expiryPreserved: boolean;
    };
    expect(result.firstValue).toBe(1);
    expect(result.secondValue).toBe(2);
    expect(result.expiryPreserved).toBe(true);
  }, 75_000);

  it('times out locked and queued increments without writing after their callers finish', async () => {
    const script = `
      import { randomUUID } from 'node:crypto';
      import postgres from 'postgres';
      import { createPostgresStore } from './src/services/kv/postgres.ts';

      async function main() {
        const original = new URL(process.env.DATABASE_URL);
        const admin = postgres(original.toString(), { max: 1, prepare: false });
        const monitor = postgres(original.toString(), { max: 1, prepare: false });
        const id = randomUUID();
        const name = 'pr492-deadline-' + id;
        const key = 'review:' + id + ':blocked';
        const isolated = new URL(original);
        isolated.searchParams.set('application_name', name);
        const store = createPostgresStore(isolated.toString());
        let release = () => {};
        let holder;
        try {
          await store.incr(key, 60_000);
          let locked;
          const lockedRow = new Promise((resolve) => { locked = resolve; });
          const released = new Promise((resolve) => { release = resolve; });
          holder = admin.begin(async (tx) => {
            await tx.unsafe('SELECT key FROM kv_store WHERE key = $1 FOR UPDATE', [key]);
            locked();
            await released;
          });
          await lockedRow;
          const started = performance.now();
          const attempts = [];
          for (let index = 0; index < 4; index++) {
            attempts.push(store.incr(key, 60_000).then(
              (value) => ({ value }),
              (error) => ({ name: error.name, code: error.code })
            ));
            await new Promise((resolve) => setTimeout(resolve, 100));
          }
          let waiting = false;
          for (let attempt = 0; attempt < 100 && !waiting; attempt++) {
            const rows = await monitor.unsafe("SELECT count(*)::int AS waiting FROM pg_stat_activity WHERE application_name = $1 AND wait_event_type = 'Lock'", [name]);
            waiting = rows[0].waiting > 0;
            if (!waiting) await new Promise((resolve) => setTimeout(resolve, 50));
          }
          if (!waiting) throw Error('counter did not wait for the row lock');
          const unrelated = await store.incr('review:' + id + ':free', 60_000);
          const outcomes = await Promise.race([
            Promise.all(attempts),
            new Promise((resolve) => setTimeout(() => resolve(null), 8_000))
          ]);
          const elapsed = performance.now() - started;
          const before = await monitor.unsafe('SELECT value FROM kv_store WHERE key = $1', [key]);
          release();
          await holder;
          // Let any incorrectly retained queued actions run before checking.
          await Promise.all(attempts);
          const next = await store.incr(key, 60_000);
          await new Promise((resolve) => setTimeout(resolve, 500));
          const after = await monitor.unsafe('SELECT value FROM kv_store WHERE key = $1', [key]);
          console.log(JSON.stringify({ outcomes, elapsed, unrelated, before: before[0].value, next, after: after[0].value }));
        } finally {
          release();
          if (holder) await holder;
          await monitor.end();
          await admin.end();
        }
      }
      main().then(() => process.exit(0), (error) => { console.error(error); process.exit(1); });
    `;
    const { stdout } = await services.runBun(script);
    const result = JSON.parse(stdout.trim().split('\n').at(-1) ?? '') as {
      outcomes: { name?: string; code?: string; value?: number }[] | null;
      elapsed: number;
      unrelated: number;
      before: string;
      next: number;
      after: string;
    };
    expect(result.outcomes).toEqual(
      Array.from({ length: 4 }, () => ({ name: 'CounterDeadlineExceededError', code: 'COUNTER_DEADLINE_EXCEEDED' }))
    );
    expect(result.elapsed).toBeLessThan(8_000);
    expect(result.unrelated).toBe(1);
    expect(result.before).toBe('1');
    expect(result.next).toBe(2);
    expect(result.after).toBe('2');
  }, 75_000);

  it('rolls back a statement that exceeds the deadline before releasing queued callers', async () => {
    const script = `
      import { randomUUID } from 'node:crypto';
      import postgres from 'postgres';
      import { createPostgresStore } from './src/services/kv/postgres.ts';

      async function main() {
        const original = new URL(process.env.DATABASE_URL);
        const admin = postgres(original.toString(), { max: 1, prepare: false });
        const monitor = postgres(original.toString(), { max: 1, prepare: false });
        const name = 'pr492-statement-' + randomUUID();
        const key = 'review:slow-statement';
        const isolated = new URL(original);
        isolated.searchParams.set('application_name', name);
        const store = createPostgresStore(isolated.toString());
        const strictUrl = new URL(isolated);
        strictUrl.searchParams.set('statement_timeout', '800');
        const strictStore = createPostgresStore(strictUrl.toString());
        const realWallNow = Date.now;
        const realMonotonicNow = performance.now.bind(performance);
        const originalNow = Object.getOwnPropertyDescriptor(performance, 'now');
        const phase = (name) => console.error('PR492_PHASE=' + name);
        function shiftClocks(offset) {
          Date.now = () => realWallNow() + offset;
          Object.defineProperty(performance, 'now', { value: () => realMonotonicNow() + offset, configurable: true });
        }
        function restoreClocks() {
          Date.now = realWallNow;
          if (originalNow) Object.defineProperty(performance, 'now', originalNow);
          else delete performance.now;
        }
        async function sleepingPid() {
          for (let attempt = 0; attempt < 100; attempt++) {
            const rows = await monitor.unsafe("SELECT pid FROM pg_stat_activity WHERE application_name = $1 AND wait_event = 'PgSleep'", [name]);
            if (rows.length) return rows[0].pid;
            await new Promise((resolve) => setTimeout(resolve, 50));
          }
          throw Error('counter update did not enter the slow statement');
        }
        try {
          phase('setup');
          await store.incr(key, 60_000);
          await admin.unsafe("CREATE FUNCTION pr492_slow_counter() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_sleep(7); RETURN NEW; END $$");
          await admin.unsafe("CREATE TRIGGER pr492_slow_counter BEFORE UPDATE ON kv_store FOR EACH ROW WHEN (OLD.key = 'review:slow-statement') EXECUTE FUNCTION pr492_slow_counter()");
          const strictStarted = performance.now();
          const strict = strictStore.incr(key, 60_000).then(() => 'success', (error) => error.code);
          phase('strict-wait');
          await sleepingPid();
          // A configured PostgreSQL timeout remains its own error even if the client clock jumps forward.
          shiftClocks(6_000);
          const strictCode = await strict;
          restoreClocks();
          phase('strict-done');
          const strictElapsed = performance.now() - strictStarted;
          const attempts = Array.from({ length: 2 }, () => store.incr(key, 60_000).then(
            (value) => ({ value }),
            (error) => ({ name: error.name, code: error.code })
          ));
          phase('deadline-wait');
          await sleepingPid();
          // Force the real server timeout to arrive while both client clocks still show time remaining.
          shiftClocks(-500);
          const outcomes = await Promise.all(attempts);
          restoreClocks();
          phase('deadline-done');
          const cancelled = store.incr(key, 60_000).then(
            (value) => ({ value }),
            (error) => ({ name: error.name, code: error.code, message: error.message })
          );
          phase('cancel-wait');
          const pid = await sleepingPid();
          // An independent cancellation is not our deadline even if the client clock has moved past it.
          shiftClocks(6_000);
          const cancellation = await monitor.unsafe('SELECT pg_cancel_backend($1) AS cancelled', [pid]);
          const cancelledOutcome = await cancelled;
          restoreClocks();
          phase('cancel-done');
          const before = await monitor.unsafe('SELECT value FROM kv_store WHERE key = $1', [key]);
          await admin.unsafe('DROP TRIGGER pr492_slow_counter ON kv_store');
          await admin.unsafe('DROP FUNCTION pr492_slow_counter()');
          await admin.unsafe("CREATE FUNCTION pr492_commit_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION USING ERRCODE = '57014', MESSAGE = 'canceling statement due to statement timeout'; END $$");
          await admin.unsafe("CREATE CONSTRAINT TRIGGER pr492_commit_failure AFTER UPDATE ON kv_store DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (NEW.key = 'review:slow-statement') EXECUTE FUNCTION pr492_commit_failure()");
          phase('commit-wait');
          const commitOutcome = await store.incr(key, 60_000).then(
            (value) => ({ value }),
            (error) => ({ name: error.name, code: error.code, outcome: error.outcome ?? null })
          );
          phase('commit-done');
          const afterCommitFailure = await monitor.unsafe('SELECT value FROM kv_store WHERE key = $1', [key]);
          await admin.unsafe('DROP TRIGGER pr492_commit_failure ON kv_store');
          await admin.unsafe('DROP FUNCTION pr492_commit_failure()');
          const next = await store.incr(key, 60_000);
          phase('complete');
          console.log(JSON.stringify({ strictCode, strictElapsed, outcomes, cancelledOutcome, cancelled: cancellation[0].cancelled, before: before[0].value, commitOutcome, afterCommitFailure: afterCommitFailure[0].value, next }));
        } finally {
          restoreClocks();
          await monitor.end({ timeout: 2 });
          await admin.end({ timeout: 2 });
        }
      }
      main().then(() => process.exit(0), (error) => { console.error(error); process.exit(1); });
    `;
    const { stdout } = await services.runBun(script, 20_000).catch((error: unknown) => {
      const stderr = typeof error === 'object' && error !== null && 'stderr' in error ? String(error.stderr) : '';
      const phases = stderr.split('\n').filter((line) => line.startsWith('PR492_PHASE='));
      throw new Error(`Owned PostgreSQL statement test failed after: ${phases.join(', ')}`, { cause: error });
    });
    const result = JSON.parse(stdout.trim().split('\n').at(-1) ?? '') as {
      strictCode: string;
      strictElapsed: number;
      outcomes: { name?: string; code?: string; value?: number }[];
      cancelledOutcome: { name?: string; code?: string; message?: string };
      cancelled: boolean;
      before: string;
      commitOutcome: { name?: string; code?: string; outcome?: string | null; value?: number };
      afterCommitFailure: string;
      next: number;
    };
    expect(result.outcomes).toEqual(
      Array.from({ length: 2 }, () => ({ name: 'CounterDeadlineExceededError', code: 'COUNTER_DEADLINE_EXCEEDED' }))
    );
    expect(result.strictCode).toBe('57014');
    expect(result.strictElapsed).toBeLessThan(3_000);
    expect(result.cancelled).toBe(true);
    expect(result.cancelledOutcome).toMatchObject({ name: 'PostgresError', code: '57014' });
    expect(result.cancelledOutcome.message).toContain('user request');
    expect(result.before).toBe('1');
    expect(result.commitOutcome).toMatchObject({ name: 'PostgresError', code: '57014', outcome: null });
    expect(result.afterCommitFailure).toBe('1');
    expect(result.next).toBe(2);
  }, 75_000);
});
