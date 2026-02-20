import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './db/schema';

const connectionString = process.env.DATABASE_URL;

if (!connectionString && process.env.NODE_ENV !== 'production') {
  console.warn('Missing DATABASE_URL environment variable');
}

// Declare global type for caching across hot reloads
declare global {
  // eslint-disable-next-line no-var
  var _pgClient: ReturnType<typeof postgres> | undefined;
  // eslint-disable-next-line no-var
  var _db: ReturnType<typeof drizzle<typeof schema>> | undefined;
}

function getPostgresClient() {
  if (!connectionString) {
    return new Proxy({} as ReturnType<typeof postgres>, {
      get() {
        throw new Error('Missing DATABASE_URL environment variable');
      },
      apply() {
        throw new Error('Missing DATABASE_URL environment variable');
      },
    }) as ReturnType<typeof postgres>;
  }

  // Reuse connection across hot reloads (dev) and cold starts (prod).
  // Without this, every Vercel cold start creates a new TCP connection
  // to Supabase (~50-100ms overhead).
  if (!globalThis._pgClient) {
    globalThis._pgClient = postgres(connectionString);
  }
  return globalThis._pgClient;
}

function getDb() {
  if (!connectionString) {
    return new Proxy({} as ReturnType<typeof drizzle<typeof schema>>, {
      get() {
        throw new Error('Missing DATABASE_URL environment variable');
      },
    }) as ReturnType<typeof drizzle<typeof schema>>;
  }

  if (!globalThis._db) {
    globalThis._db = drizzle(getPostgresClient(), { schema });
  }
  return globalThis._db;
}

const sql = getPostgresClient();
const db = getDb();

export { sql, db };
