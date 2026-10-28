import dns from 'node:dns';
import postgres from 'postgres';

import { postgresTlsOptions } from '../apps/registry/src/lib/db/tls.ts';

// Force IPv4 resolution to avoid ECONNREFUSED on hosts with broken IPv6
dns.setDefaultResultOrder('ipv4first');

const dbUrl = process.env.DATABASE_URL;

if (!dbUrl) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

const ssl = postgresTlsOptions(dbUrl);
const sql = postgres(dbUrl, ssl ? { ssl } : {});

try {
  await sql`CREATE EXTENSION IF NOT EXISTS pg_trgm`;
} finally {
  await sql.end();
}
