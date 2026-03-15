import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { env } from '../env';
import * as schema from './schema';

const connectionString = env.DATABASE_URL;

if (!connectionString && process.env.NODE_ENV !== 'production') {
}

function createClient() {
  if (!connectionString) {
    return new Proxy({} as ReturnType<typeof postgres>, {
      get() {
        throw new Error('Missing DATABASE_URL environment variable');
      },
      apply() {
        throw new Error('Missing DATABASE_URL environment variable');
      }
    }) as ReturnType<typeof postgres>;
  }
  return postgres(connectionString);
}

function createDb(client: ReturnType<typeof postgres>) {
  if (!connectionString) {
    return new Proxy({} as ReturnType<typeof drizzle<typeof schema>>, {
      get() {
        throw new Error('Missing DATABASE_URL environment variable');
      }
    }) as ReturnType<typeof drizzle<typeof schema>>;
  }
  return drizzle(client, { schema });
}

const sql = createClient();
const db = createDb(sql);

export { db, sql };
