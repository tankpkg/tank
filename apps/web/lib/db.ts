import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './db/schema';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('Missing DATABASE_URL environment variable');
}

/**
 * Raw postgres.js client.
 * Used by Drizzle ORM internally. Exported for edge cases
 * where you need raw SQL outside of Drizzle (e.g. health checks).
 *
 * For Supabase pooler (session mode, port 5432):
 *   prepare: false is NOT needed — session mode supports prepared statements.
 * For transaction mode (port 6543):
 *   Set prepare: false if you switch to transaction pooling.
 */
export const sql = postgres(connectionString);

/**
 * Drizzle ORM instance with full schema for relational queries.
 * Import this in your app code for all database operations.
 *
 * Usage: `import { db } from '@/lib/db';`
 */
export const db = drizzle(sql, { schema });
