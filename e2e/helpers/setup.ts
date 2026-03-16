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
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { generateUuid, hash } from 'cipher-kit/node';

import postgres from 'postgres';

import { getCurrentAppTarget } from '../targets.js';

function loadDatabaseUrlFromEnvFile(): string | undefined {
  const envPath = path.resolve(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) {
    return process.env.DATABASE_URL;
  }

  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator <= 0) continue;
    if (trimmed.slice(0, separator).trim() !== 'DATABASE_URL') continue;
    const value = trimmed
      .slice(separator + 1)
      .trim()
      .replace(/^["']|["']$/g, '');
    process.env.DATABASE_URL = value;
    return value;
  }

  return process.env.DATABASE_URL;
}

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

function hashApiKey(plainKey: string): string {
  return hash(plainKey);
}

function createApiKey(seed: string): string {
  let key = `tank_e2e_${seed}_${generateUuid().replace(/-/g, '')}`;
  while (key.length < 64) {
    key += generateUuid().replace(/-/g, '');
  }
  return key;
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

export async function setupE2E(registry = getCurrentAppTarget().registryUrl): Promise<E2EContext> {
  const connectionString = process.env.DATABASE_URL || loadDatabaseUrlFromEnvFile();
  if (!connectionString) {
    throw new Error('DATABASE_URL is required for E2E tests. Set it in .env');
  }

  const sql = postgres(connectionString);
  const runId = generateUuid().replace(/-/g, '').slice(0, 10);
  const userId = `e2e-user-${runId}`;
  const orgSlug = `e2etest-${runId}`;
  const orgId = `e2e-org-${runId}`;
  const memberId = `e2e-member-${runId}`;
  const apiKeyId = `e2e-apikey-${runId}`;
  const plainKey = createApiKey(runId);
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
    `${JSON.stringify(
      {
        registry,
        token: plainKey,
        user: { name: 'E2E Test User', email: `e2e-${runId}@tank.test` }
      },
      null,
      2
    )}\n`,
    { mode: 0o600 }
  );

  return {
    runId,
    token: plainKey,
    user: { id: userId, name: 'E2E Test User', email: `e2e-${runId}@tank.test` },
    orgSlug,
    home,
    registry,
    sql
  };
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

/**
 * Remove all test data from the database and temp files.
 * Deletes in reverse dependency order.
 */
export async function cleanupE2E(ctx?: E2EContext | null): Promise<void> {
  if (!ctx) {
    return;
  }

  const { sql, runId, home } = ctx;
  const userId = `e2e-user-${runId}`;
  const orgId = `e2e-org-${runId}`;

  const safeDelete = async (query: ReturnType<typeof sql>) => {
    try {
      await query;
    } catch (e: unknown) {
      const code = (e as { code?: string }).code;
      if (code !== '42P01') throw e;
    }
  };

  try {
    const skillIds = sql`SELECT id FROM skills WHERE publisher_id = ${userId}`;
    const versionIds = sql`SELECT sv.id FROM skill_versions sv JOIN skills s ON sv.skill_id = s.id WHERE s.publisher_id = ${userId}`;

    await safeDelete(
      sql`DELETE FROM scan_findings WHERE scan_id IN (SELECT id FROM scan_results WHERE version_id IN (${versionIds}))`
    );
    await safeDelete(sql`DELETE FROM scan_results WHERE version_id IN (${versionIds})`);
    await safeDelete(sql`DELETE FROM skill_stars WHERE skill_id IN (${skillIds})`);
    await safeDelete(sql`DELETE FROM skill_access WHERE skill_id IN (${skillIds})`);
    await safeDelete(sql`DELETE FROM skill_download_daily WHERE skill_id IN (${skillIds})`);
    await sql`DELETE FROM skill_versions WHERE skill_id IN (${skillIds})`;
    await sql`DELETE FROM skills WHERE publisher_id = ${userId}`;

    await sql`DELETE FROM audit_events WHERE actor_id = ${userId}`;
    await sql`DELETE FROM "member" WHERE id LIKE ${`e2e-member-${runId}%`}`;
    await sql`DELETE FROM "organization" WHERE id = ${orgId}`;
    await sql`DELETE FROM "apikey" WHERE id LIKE ${`e2e-apikey-${runId}%`}`;
    await sql`DELETE FROM "session" WHERE user_id = ${userId}`;
    await sql`DELETE FROM "user" WHERE id = ${userId}`;
  } catch (_err) {}

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
export async function versionExists(sql: postgres.Sql, name: string, version: string): Promise<boolean> {
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
