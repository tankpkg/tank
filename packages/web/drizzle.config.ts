import { defineConfig } from 'drizzle-kit';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required to run drizzle-kit');
}

export default defineConfig({
  dialect: 'postgresql',
  schema: ['./lib/db/schema.ts', './lib/db/auth-schema.ts'],
  out: './drizzle',
  dbCredentials: {
    url: databaseUrl
  }
});
