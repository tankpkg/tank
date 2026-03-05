import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import postgres from 'postgres';

export interface E2EContext {
  runId: string;
  token: string;
  user: { id: string; name: string; email: string };
  orgSlug: string;
  home: string;
  registry: string;
  sql: postgres.Sql;
}

function hashApiKey(plainKey: string): string {
  const hash = createHash('sha256').update(plainKey).digest();
  return hash.toString('base64url');
}

export async function setupE2E(
  registry = process.env.E2E_REGISTRY_URL || 'http://localhost:3003',
): Promise<E2EContext> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is required for BDD tests. Set it in .env.local');
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

  await sql`
    INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
    VALUES (${userId}, ${'E2E Test User'}, ${`e2e-${runId}@tank.test`}, true, ${now}, ${now})
  `;

  await sql`
    INSERT INTO "apikey" (id, key, start, prefix, user_id, enabled, rate_limit_enabled,
                          rate_limit_time_window, rate_limit_max, request_count,
                          created_at, updated_at)
    VALUES (${apiKeyId}, ${hashedKey}, ${plainKey.substring(0, 6)}, ${'tank_'},
            ${userId}, true, false, 86400000, 1000, 0, ${now}, ${now})
  `;

  await sql`
    INSERT INTO "organization" (id, name, slug, created_at)
    VALUES (${orgId}, ${'E2E Test Org'}, ${orgSlug}, ${now})
  `;

  await sql`
    INSERT INTO "member" (id, organization_id, user_id, role, created_at)
    VALUES (${memberId}, ${orgId}, ${userId}, ${'owner'}, ${now})
  `;

  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'tank-bdd-'));
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

export async function cleanupE2E(ctx: E2EContext): Promise<void> {
  const { sql, runId, home } = ctx;
  const userId = `e2e-user-${runId}`;
  const orgId = `e2e-org-${runId}`;

  const safeDelete = async (query: ReturnType<typeof sql>) => {
    try {
      await query;
    } catch (error: unknown) {
      const code = (error as { code?: string }).code;
      if (code !== '42P01') {
        throw error;
      }
    }
  };

  try {
    const skillIds = sql`SELECT id FROM skills WHERE publisher_id = ${userId}`;
    const versionIds =
      sql`SELECT sv.id FROM skill_versions sv JOIN skills s ON sv.skill_id = s.id WHERE s.publisher_id = ${userId}`;

    await safeDelete(
      sql`DELETE FROM scan_findings WHERE scan_id IN (SELECT id FROM scan_results WHERE version_id IN (${versionIds}))`,
    );
    await safeDelete(sql`DELETE FROM scan_results WHERE version_id IN (${versionIds})`);
    await safeDelete(sql`DELETE FROM skill_stars WHERE skill_id IN (${skillIds})`);
    await safeDelete(sql`DELETE FROM skill_access WHERE skill_id IN (${skillIds})`);
    await safeDelete(sql`DELETE FROM skill_download_daily WHERE skill_id IN (${skillIds})`);
    await sql`DELETE FROM skill_versions WHERE skill_id IN (${skillIds})`;
    await sql`DELETE FROM skills WHERE publisher_id = ${userId}`;

    await sql`DELETE FROM audit_events WHERE actor_id = ${userId}`;
    await sql`DELETE FROM "member" WHERE id LIKE ${'e2e-member-' + runId + '%'}`;
    await sql`DELETE FROM "organization" WHERE id = ${orgId}`;
    await sql`DELETE FROM "apikey" WHERE id LIKE ${'e2e-apikey-' + runId + '%'}`;
    await sql`DELETE FROM "session" WHERE user_id = ${userId}`;
    await sql`DELETE FROM "user" WHERE id = ${userId}`;
  } catch (error) {
    console.warn(`BDD cleanup warning (non-fatal): ${error}`);
  }

  try {
    fs.rmSync(home, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors.
  }

  await sql.end();
}
