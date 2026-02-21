/**
 * E2E Auth & DB Setup — direct database seeding for test isolation.
 * ZERO mocks: real database, real API keys with correct hashing.
 *
 * Strategy:
 * 1. Insert user directly into the `user` table
 * 2. Insert API key with SHA-256 hash (same algorithm better-auth uses)
 * 3. Insert organization + membership
 * 4. Write CLI config to isolated temp HOME directory
 * 5. Clean up all test data after suite completes
 */
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import postgres from 'postgres';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface E2EContext {
  /** Unique run ID for test isolation */
  runId: string;
  /** Plain-text API key (starts with tank_) */
  token: string;
  /** Test user info */
  user: { id: string; name: string; email: string };
  /** Organization slug for scoped packages */
  orgSlug: string;
  /** Isolated HOME directory (contains .tank/config.json) */
  home: string;
  /** Registry URL */
  registry: string;
  /** Database client (for verification queries and cleanup) */
  sql: postgres.Sql;
}

// ---------------------------------------------------------------------------
// API Key Hashing (matches better-auth's defaultKeyHasher)
// ---------------------------------------------------------------------------

/**
 * Hash an API key exactly as better-auth does:
 * SHA-256 → base64url (no padding)
 */
function hashApiKey(plainKey: string): string {
  const hash = createHash('sha256').update(plainKey).digest();
  // Node.js Buffer.toString('base64url') produces base64url WITHOUT padding
  return hash.toString('base64url');
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

/**
 * Create all database records and config files needed for E2E tests.
 * Returns an E2EContext that test files use for CLI spawning.
 *
 * Note: Uses crypto.randomUUID() for generating test IDs and API keys.
 * This is cryptographically secure (not Math.random()).
 */
export async function setupE2E(
  registry = 'http://localhost:3000',
): Promise<E2EContext> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is required for E2E tests. Set it in .env.local');
  }

  const sql = postgres(connectionString);
  const runId = randomUUID().replace(/-/g, '').slice(0, 10);
  const userId = `e2e-user-${runId}`;
  const orgSlug = `e2etest-${runId}`;
  const orgId = `e2e-org-${runId}`;
  const memberId = `e2e-member-${runId}`;
  const apiKeyId = `e2e-apikey-${runId}`;
  const plainKey = `tank_e2e_${runId}_${randomUUID().replace(/-/g, '')}`;
  const hashedKey = hashApiKey(plainKey);
  const now = new Date();

  // 1. Create test user
  await sql`
    INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
    VALUES (${userId}, ${'E2E Test User'}, ${`e2e-${runId}@tank.test`}, true, ${now}, ${now})
  `;

  // 2. Create API key (SHA-256 hashed, same as better-auth)
  await sql`
    INSERT INTO "apikey" (id, key, start, prefix, user_id, enabled, rate_limit_enabled,
                          rate_limit_time_window, rate_limit_max, request_count,
                          created_at, updated_at)
    VALUES (${apiKeyId}, ${hashedKey}, ${plainKey.substring(0, 6)}, ${'tank_'},
            ${userId}, true, false, 86400000, 1000, 0, ${now}, ${now})
  `;

  // 3. Create organization
  await sql`
    INSERT INTO "organization" (id, name, slug, created_at)
    VALUES (${orgId}, ${'E2E Test Org'}, ${orgSlug}, ${now})
  `;

  // 4. Create membership (user is owner of the org)
  await sql`
    INSERT INTO "member" (id, organization_id, user_id, role, created_at)
    VALUES (${memberId}, ${orgId}, ${userId}, ${'owner'}, ${now})
  `;

  // 5. Create isolated HOME directory with CLI config
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'tank-e2e-'));
  const tankDir = path.join(home, '.tank');
  fs.mkdirSync(tankDir, { recursive: true, mode: 0o700 });
  fs.writeFileSync(
    path.join(tankDir, 'config.json'),
    JSON.stringify(
      {
        registry,
        token: plainKey,
        user: { name: 'E2E Test User', email: `e2e-${runId}@tank.test` },
      },
      null,
      2,
    ) + '\n',
    { mode: 0o600 },
  );

  return {
    runId,
    token: plainKey,
    user: { id: userId, name: 'E2E Test User', email: `e2e-${runId}@tank.test` },
    orgSlug,
    home,
    registry,
    sql,
  };
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

/**
 * Remove all test data from the database and temp files.
 * Deletes in reverse dependency order.
 */
export async function cleanupE2E(ctx: E2EContext): Promise<void> {
  const { sql, runId, home } = ctx;
  const userId = `e2e-user-${runId}`;
  const orgId = `e2e-org-${runId}`;

  try {
    // Delete skill data (cascades: downloads → versions → skills)
    await sql`
      DELETE FROM skill_downloads WHERE skill_id IN (
        SELECT id FROM skills WHERE publisher_id = ${userId}
      )
    `;
    await sql`
      DELETE FROM skill_versions WHERE skill_id IN (
        SELECT id FROM skills WHERE publisher_id = ${userId}
      )
    `;
    await sql`DELETE FROM skills WHERE publisher_id = ${userId}`;

    // Delete auth data (reverse dependency order)
    await sql`DELETE FROM "member" WHERE id LIKE ${'e2e-member-' + runId + '%'}`;
    await sql`DELETE FROM "organization" WHERE id = ${orgId}`;
    await sql`DELETE FROM "apikey" WHERE id LIKE ${'e2e-apikey-' + runId + '%'}`;
    await sql`DELETE FROM "session" WHERE user_id = ${userId}`;
    await sql`DELETE FROM "user" WHERE id = ${userId}`;

    // Delete audit events
    await sql`DELETE FROM audit_events WHERE actor_id = ${userId}`;
  } catch (err) {
    console.warn(`E2E cleanup warning (non-fatal): ${err}`);
  }

  // Clean up temp HOME directory
  try {
    fs.rmSync(home, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }

  // Close DB connection
  await sql.end();
}

// ---------------------------------------------------------------------------
// Verification helpers (for assertions in tests)
// ---------------------------------------------------------------------------

/**
 * Query the database to check if a skill exists.
 */
export async function skillExists(sql: postgres.Sql, name: string): Promise<boolean> {
  const rows = await sql`SELECT 1 FROM skills WHERE name = ${name}`;
  return rows.length > 0;
}

/**
 * Query the database to check if a skill version exists.
 */
export async function versionExists(
  sql: postgres.Sql,
  name: string,
  version: string,
): Promise<boolean> {
  const rows = await sql`
    SELECT 1 FROM skill_versions sv
    JOIN skills s ON sv.skill_id = s.id
    WHERE s.name = ${name} AND sv.version = ${version}
  `;
  return rows.length > 0;
}

/**
 * Count skill versions in the database for a given skill name.
 */
export async function countVersions(sql: postgres.Sql, name: string): Promise<number> {
  const rows = await sql`
    SELECT count(*) as count FROM skill_versions sv
    JOIN skills s ON sv.skill_id = s.id
    WHERE s.name = ${name}
  `;
  return Number(rows[0]?.count ?? 0);
}
