/**
 * bootstrap-headless.ts — Create initial admin user for headless Docker setup.
 * Called from entrypoint.sh when AUTO_MIGRATE=true and FIRST_ADMIN_EMAIL is set.
 *
 * Required env vars:
 *   FIRST_ADMIN_EMAIL    — admin email address
 *   FIRST_ADMIN_PASSWORD — admin password (min 8 chars)
 *   DATABASE_URL         — PostgreSQL connection string
 *
 * Usage:
 *   bun run scripts/bootstrap-headless.ts
 */

import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

const email = process.env.FIRST_ADMIN_EMAIL;
const password = process.env.FIRST_ADMIN_PASSWORD;
const dbUrl = process.env.DATABASE_URL;

if (!email || !password || !dbUrl) {
  console.error('[bootstrap] Missing required env: FIRST_ADMIN_EMAIL, FIRST_ADMIN_PASSWORD, DATABASE_URL');
  process.exit(1);
}

if (password.length < 8) {
  console.error('[bootstrap] FIRST_ADMIN_PASSWORD must be at least 8 characters');
  process.exit(1);
}

const client = postgres(dbUrl);
const db = drizzle(client);

try {
  const existing = await db.execute(sql`SELECT id FROM "user" WHERE email = ${email} LIMIT 1`);

  if (existing.length > 0) {
    await db.execute(
      sql`UPDATE "user" SET role = 'admin', email_verified = true, updated_at = NOW() WHERE email = ${email}`
    );
    console.log(`[bootstrap] User ${email} already exists — promoted to admin`);
  } else {
    // bcrypt via Bun.password matches Better Auth's credential provider hash format
    const hashedPassword = await Bun.password.hash(password, { algorithm: 'bcrypt', cost: 10 });

    const { randomBytes } = await import('node:crypto');
    const userId = randomBytes(16).toString('hex');
    const accountId = randomBytes(16).toString('hex');

    await db.execute(
      sql`INSERT INTO "user" (id, name, email, email_verified, role, created_at, updated_at)
          VALUES (${userId}, 'Admin', ${email}, true, 'admin', NOW(), NOW())`
    );

    await db.execute(
      sql`INSERT INTO account (id, account_id, provider_id, user_id, password, created_at, updated_at)
          VALUES (${accountId}, ${email}, 'credential', ${userId}, ${hashedPassword}, NOW(), NOW())`
    );

    console.log(`[bootstrap] Created admin user: ${email}`);
  }
} catch (e) {
  console.error('[bootstrap] Failed:', e instanceof Error ? e.message : e);
  process.exit(1);
} finally {
  await client.end();
}
