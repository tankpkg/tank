// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type OwnedServices, startOwnedServices } from './pr492-owned-services';

describe.skipIf(process.env.PR492_ISOLATED_CONFIG !== '1')('PostgreSQL counter transactions', () => {
  let services: OwnedServices;
  beforeAll(async () => {
    services = await startOwnedServices('postgres');
  }, 180_000);
  afterAll(async () => {
    if (services) await services.close();
  }, 180_000);

  it('serializes first inserts and rolls back failed window creation', async () => {
    const script = `
      import { randomUUID } from 'node:crypto';
      import postgres from 'postgres';
      import { createPostgresStore } from './src/services/kv/postgres.ts';
      async function main() {
        const isolated = new URL(process.env.DATABASE_URL);
        const name = 'pr492-counter-' + randomUUID();
        const storeUrl = new URL(isolated);
        storeUrl.searchParams.set('application_name', name);
        const sql = postgres(isolated.toString(), { max: 3, prepare: false });
        const stores = Array.from({ length: 4 }, () => createPostgresStore(storeUrl.toString()));
        try {
          await stores[0].set('review:warm', 'value', 60_000);
          await Promise.all(stores.slice(1).map((store) => store.get('review:warm')));
          const counts = (await Promise.all(Array.from({ length: 32 }, (_, index) =>
            stores[index % stores.length].incr('review:concurrent', 60_000)))).sort((a, b) => a - b);

          let locked;
          let release;
          const lockedRow = new Promise((resolve) => { locked = resolve; });
          const released = new Promise((resolve) => { release = resolve; });
          const holder = sql.begin(async (tx) => {
            await tx.unsafe("INSERT INTO kv_store (key, value, expires_at) VALUES ('review:rollback', '9', clock_timestamp())");
            locked();
            await released;
            throw Error('expected rollback');
          }).catch((error) => error.message);
          await lockedRow;
          const blocked = stores[0].incr('review:rollback', 2_000);
          let waiting = false;
          for (let attempt = 0; attempt < 100 && !waiting; attempt++) {
            const rows = await sql.unsafe("SELECT count(*)::int AS waiting FROM pg_stat_activity WHERE application_name = $1 AND wait_event_type = 'Lock'", [name]);
            waiting = rows[0].waiting > 0;
            if (!waiting) await new Promise((resolve) => setTimeout(resolve, 50));
          }
          release();
          await holder;
          const first = await blocked;
          const second = await stores[0].incr('review:rollback', 2_000);

          await sql.unsafe("CREATE FUNCTION review_reject_update() RETURNS trigger AS $$ BEGIN IF NEW.key = 'review:failure' THEN RAISE EXCEPTION 'injected failure'; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql");
          await sql.unsafe('CREATE TRIGGER review_reject_update BEFORE UPDATE ON kv_store FOR EACH ROW EXECUTE FUNCTION review_reject_update()');
          let failed = false;
          try { await stores[0].incr('review:failure', 60_000); } catch { failed = true; }
          const rows = await sql.unsafe("SELECT key FROM kv_store WHERE key = 'review:failure'");
          console.log(JSON.stringify({ counts, waiting, first, second, failed, remaining: rows.length }));
        } finally {
          await sql.end();
        }
      }
      main().then(() => process.exit(0), (error) => { console.error(error); process.exit(1); });
    `;
    const { stdout } = await services.runBun(script);
    const result = JSON.parse(stdout.trim().split('\n').at(-1) ?? '') as {
      counts: number[];
      waiting: boolean;
      first: number;
      second: number;
      failed: boolean;
      remaining: number;
    };
    expect(result.counts).toEqual(Array.from({ length: 32 }, (_, index) => index + 1));
    expect(result.waiting).toBe(true);
    expect([result.first, result.second]).toEqual([1, 2]);
    expect(result.failed).toBe(true);
    expect(result.remaining).toBe(0);
  }, 75_000);
});
