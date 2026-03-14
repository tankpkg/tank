import postgres from 'postgres';

const dbUrl = process.env.DATABASE_URL;

if (!dbUrl) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

const sql = postgres(dbUrl);

try {
  await sql`CREATE EXTENSION IF NOT EXISTS pg_trgm`;
} finally {
  await sql.end();
}
