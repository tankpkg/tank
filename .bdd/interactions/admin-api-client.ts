import { randomUUID, scryptSync, randomBytes } from 'node:crypto';
import postgres from 'postgres';

export interface AdminSession {
  userId: string;
  cookieHeader: string;
}

export interface AdminApiClient {
  registry: string;
  session: AdminSession | null;
  sql: postgres.Sql;
}

// Matches better-auth's scrypt config (better-auth/dist/crypto/password.mjs): N=16384, r=16, p=1, dkLen=64
function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const key = scryptSync(password.normalize('NFKC'), salt, 64, {
    N: 16384,
    p: 1,
    r: 16,
    maxmem: 128 * 16384 * 16 * 2,
  });
  return `${salt}:${key.toString('hex')}`;
}

export function createAdminApiClient(
  registry: string,
  sql: postgres.Sql,
): AdminApiClient {
  return { registry, session: null, sql };
}

export async function createAdminSession(
  client: AdminApiClient,
  runId: string,
): Promise<AdminSession> {
  const { sql, registry } = client;
  const userId = `e2e-admin-${runId}`;
  const email = `e2e-admin-${runId}@tank.test`;
  const password = `BddTestPass_${runId}!`;
  const now = new Date();

  // 1. Insert user with email_verified = true and role = admin
  await sql`
    INSERT INTO "user" (id, name, email, email_verified, role, created_at, updated_at)
    VALUES (${userId}, ${'E2E Admin'}, ${email}, true, ${'admin'}, ${now}, ${now})
    ON CONFLICT (id) DO UPDATE SET role = 'admin', email_verified = true
  `;

  // 2. Hash password using same scrypt params as better-auth
  const hashedPassword = await hashPassword(password);

  // 3. Insert credential account so sign-in works
  const accountId = `e2e-account-${runId}`;
  await sql`
    INSERT INTO "account" (id, account_id, provider_id, user_id, password, created_at, updated_at)
    VALUES (${accountId}, ${userId}, ${'credential'}, ${userId}, ${hashedPassword}, ${now}, ${now})
    ON CONFLICT (id) DO UPDATE SET password = ${hashedPassword}
  `;

  // 4. Sign in via better-auth's email/password endpoint to get a real session cookie
  const signInRes = await fetch(`${registry}/api/auth/sign-in/email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: registry },
    body: JSON.stringify({ email, password }),
    redirect: 'manual',
  });

  if (!signInRes.ok && signInRes.status !== 302) {
    const body = await signInRes.text().catch(() => '');
    throw new Error(`BDD admin sign-in failed (${signInRes.status}): ${body}`);
  }

  // 5. Extract set-cookie header(s) — better-auth sets session_token cookie
  const setCookies = signInRes.headers.getSetCookie();
  const sessionCookie = setCookies.find((c) => c.includes('better-auth.session_token'));
  if (!sessionCookie) {
    throw new Error(
      `BDD admin sign-in did not return session cookie. Status: ${signInRes.status}, ` +
        `Set-Cookie headers: ${JSON.stringify(setCookies)}`,
    );
  }

  // Parse just the cookie key=value part (before ;)
  const cookieValue = sessionCookie.split(';')[0]!;
  const session: AdminSession = { userId, cookieHeader: cookieValue };
  client.session = session;
  return session;
}

export async function createTestPackageVersion(
  client: AdminApiClient,
  opts: {
    runId: string;
    packageName: string;
    version: string;
    publisherId: string;
  },
): Promise<{ skillId: string; versionId: string }> {
  const { sql } = client;
  const skillId = randomUUID();
  const versionId = randomUUID();
  const now = new Date();

  await sql`
    INSERT INTO skills (id, name, description, publisher_id, status, created_at, updated_at)
    VALUES (
      ${skillId},
      ${opts.packageName},
      ${'Test package for rescan BDD'},
      ${opts.publisherId},
      ${'active'},
      ${now},
      ${now}
    )
    ON CONFLICT (name) DO UPDATE SET updated_at = ${now}
    RETURNING id
  `;

  const [existingSkill] = await sql`SELECT id FROM skills WHERE name = ${opts.packageName} LIMIT 1`;
  const finalSkillId = (existingSkill?.id as string) ?? skillId;

  await sql`
    INSERT INTO skill_versions (id, skill_id, version, integrity, tarball_path, tarball_size, file_count, manifest, permissions, audit_status, published_by, created_at)
    VALUES (
      ${versionId},
      ${finalSkillId},
      ${opts.version},
      ${'sha512-fake-for-bdd-test'},
      ${'skills/test/test-1.0.0.tgz'},
      ${1024},
      ${5},
      ${JSON.stringify({ name: opts.packageName, description: 'BDD test', version: opts.version })},
      ${JSON.stringify({})},
      ${'pending'},
      ${opts.publisherId},
      ${now}
    )
  `;

  return { skillId: finalSkillId, versionId };
}

export async function postRescan(
  client: AdminApiClient,
  packageName: string,
  version: string,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const url = `${client.registry}/api/admin/packages/${encodeURIComponent(packageName)}/versions/${encodeURIComponent(version)}/rescan`;

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (client.session) {
    headers['Cookie'] = client.session.cookieHeader;
  }

  const response = await fetch(url, { method: 'POST', headers });
  const body = (await response.json()) as Record<string, unknown>;
  return { status: response.status, body };
}

export async function cleanupAdminSession(
  client: AdminApiClient,
  runId: string,
): Promise<void> {
  const { sql } = client;
  const userId = `e2e-admin-${runId}`;

  const safeDelete = async (query: ReturnType<typeof sql>) => {
    try {
      await query;
    } catch (error: unknown) {
      const code = (error as { code?: string }).code;
      if (code !== '42P01') throw error;
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
    await safeDelete(sql`DELETE FROM skill_download_daily WHERE skill_id IN (${skillIds})`);
    await safeDelete(sql`DELETE FROM audit_events WHERE actor_id = ${userId}`);
    await sql`DELETE FROM skill_versions WHERE skill_id IN (${skillIds})`;
    await sql`DELETE FROM skills WHERE publisher_id = ${userId}`;
    await sql`DELETE FROM "account" WHERE user_id = ${userId}`;
    await sql`DELETE FROM "session" WHERE user_id = ${userId}`;
    await sql`DELETE FROM "user" WHERE id = ${userId}`;
  } catch (error) {
    console.warn(`Admin BDD cleanup warning (non-fatal): ${error}`);
  }
}
