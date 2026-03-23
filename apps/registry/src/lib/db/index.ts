import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as schema from './schema';

let _sql: ReturnType<typeof postgres> | null = null;
let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

function ensureInitialized() {
  if (_db) return;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not configured. Complete the setup wizard first.');
  _sql = postgres(url);
  _db = drizzle(_sql, { schema });
}

export function reinitializeDb(url: string) {
  process.env.DATABASE_URL = url;
  _sql = null;
  _db = null;
}

export const sql = new Proxy({} as ReturnType<typeof postgres>, {
  get(_, prop) {
    ensureInitialized();
    return (_sql as never)[prop as keyof typeof _sql];
  },
  apply(_, _thisArg, args) {
    ensureInitialized();
    return (_sql as Function).apply(_sql, args);
  }
}) as ReturnType<typeof postgres>;

export const db = new Proxy({} as ReturnType<typeof drizzle<typeof schema>>, {
  get(_, prop) {
    ensureInitialized();
    return (_db as never)[prop as keyof typeof _db];
  }
}) as ReturnType<typeof drizzle<typeof schema>>;
