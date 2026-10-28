import { defineConfig } from 'drizzle-kit';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required to run drizzle-kit');
}
if (process.env.DATABASE_SSL_CA !== undefined) {
  throw new Error('DATABASE_SSL_CA is not supported by drizzle-kit; use a separately verified migration procedure');
}

export default defineConfig({
  dialect: 'postgresql',
  schema: ['./src/lib/db/schema.ts', './src/lib/db/auth-schema.ts'],
  out: './drizzle',
  dbCredentials: {
    url: databaseUrl
  }
});
