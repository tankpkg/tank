import postgres from 'postgres';

import type { KVStore } from './store';

export function createPostgresStore(connectionString: string): KVStore {
  const sql = postgres(connectionString);
  let initialized = false;

  async function ensureTable() {
    if (initialized) return;
    await sql`
      CREATE TABLE IF NOT EXISTS kv_store (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL
      )
    `;
    initialized = true;
  }

  return {
    async get(key) {
      await ensureTable();
      const rows = await sql`
        SELECT value FROM kv_store WHERE key = ${key} AND expires_at > NOW()
      `;
      if (rows.length === 0) return null;
      return rows[0].value as string;
    },

    async set(key, value, ttlMs) {
      await ensureTable();
      const expiresAt = new Date(Date.now() + ttlMs);
      await sql`
        INSERT INTO kv_store (key, value, expires_at) VALUES (${key}, ${value}, ${expiresAt})
        ON CONFLICT (key) DO UPDATE SET value = ${value}, expires_at = ${expiresAt}
      `;
    },

    async del(key) {
      await ensureTable();
      await sql`DELETE FROM kv_store WHERE key = ${key}`;
    },

    async incr(key, ttlMs) {
      await ensureTable();
      const expiresAt = new Date(Date.now() + ttlMs);
      const rows = await sql`
        INSERT INTO kv_store (key, value, expires_at) VALUES (${key}, '1', ${expiresAt})
        ON CONFLICT (key) DO UPDATE
          SET value = (COALESCE(kv_store.value, '0')::int + 1)::text,
              expires_at = CASE WHEN kv_store.expires_at > NOW() THEN kv_store.expires_at ELSE ${expiresAt} END
        RETURNING value
      `;
      return Number.parseInt(rows[0].value as string, 10);
    }
  };
}
