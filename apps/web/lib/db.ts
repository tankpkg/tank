import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './db/schema';

const connectionString = process.env.DATABASE_URL;

if (!connectionString && process.env.NODE_ENV !== 'production') {
  console.warn('Missing DATABASE_URL environment variable');
}

const sql = connectionString
  ? postgres(connectionString)
  : (new Proxy({} as ReturnType<typeof postgres>, {
      get() {
        throw new Error('Missing DATABASE_URL environment variable');
      },
      apply() {
        throw new Error('Missing DATABASE_URL environment variable');
      },
    }) as ReturnType<typeof postgres>);

const db = connectionString
  ? drizzle(sql, { schema })
  : (new Proxy({} as ReturnType<typeof drizzle<typeof schema>>, {
      get() {
        throw new Error('Missing DATABASE_URL environment variable');
      },
    }) as ReturnType<typeof drizzle<typeof schema>>);

export { sql, db };
