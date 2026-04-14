/**
 * BDD step definitions for admin package catalog management.
 *
 * Intent: idd/modules/admin-packages/INTENT.md
 * Feature: bdd/features/system/admin-packages/packages.feature
 *
 * Runs against REAL PostgreSQL + REAL registry HTTP — zero mocks.
 * Uses createAdminSession/cleanupAdminSession to provision real admin credentials.
 */
import { randomUUID } from 'node:crypto';

import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const hasDatabase = !!process.env.DATABASE_URL;
const hasRegistry = !!process.env.E2E_REGISTRY_URL;

import {
  type AdminApiClient,
  cleanupAdminSession,
  createAdminApiClient,
  createAdminSession
} from '../../interactions/admin-api-client.js';

// ── World ──────────────────────────────────────────────────────────────────

interface AdminPackagesWorld {
  registry: string;
  sql: postgres.Sql | null;
  runId: string;
  client: AdminApiClient | null;
  testSkillId: string;
  testSkillName: string;
}

const world: AdminPackagesWorld = {
  registry: process.env.E2E_REGISTRY_URL ?? 'http://localhost:3003',
  sql: null,
  runId: '',
  client: null,
  testSkillId: '',
  testSkillName: ''
};

function requireSql(): postgres.Sql {
  if (!world.sql) {
    throw new Error('Database connection not initialized');
  }
  return world.sql;
}

function requireDatabaseUrl(): string {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is required for admin package steps');
  }
  return connectionString;
}

// ── Helpers ────────────────────────────────────────────────────────────────

async function adminGet(path: string, cookieHeader?: string): Promise<{ status: number; body: unknown }> {
  const headers: Record<string, string> = {};
  if (cookieHeader) headers.Cookie = cookieHeader;
  const res = await fetch(`${world.registry}${path}`, { headers });
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { status: res.status, body };
}

async function adminDelete(path: string, cookieHeader?: string): Promise<{ status: number; body: unknown }> {
  const headers: Record<string, string> = {};
  if (cookieHeader) headers.Cookie = cookieHeader;
  const res = await fetch(`${world.registry}${path}`, { method: 'DELETE', headers });
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { status: res.status, body };
}

interface DeleteTestIds {
  skillId: string;
  skillName: string;
  versionId: string;
  accessId: string;
}

// ── Given ──────────────────────────────────────────────────────────────────

async function givenTestSkillWithRelations(name: string): Promise<DeleteTestIds> {
  const sql = requireSql();
  const now = new Date();
  const publisherId = `pkg-pub-${world.runId}`;
  const skillId = randomUUID();
  const versionId = randomUUID();
  const accessId = randomUUID();

  await sql`
    INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
    VALUES (${publisherId}, ${'BDD Pkg Publisher'}, ${`pkg-pub-${world.runId}@tank.test`}, true, ${now}, ${now})
    ON CONFLICT (id) DO NOTHING
  `;

  await sql`
    INSERT INTO skills (id, name, description, publisher_id, status, visibility, created_at, updated_at)
    VALUES (${skillId}, ${name}, ${'BDD delete test with relations'}, ${publisherId}, ${'active'}, ${'public'}, ${now}, ${now})
    ON CONFLICT (name) DO UPDATE SET updated_at = ${now}
  `;
  const [existing] = await sql`SELECT id FROM skills WHERE name = ${name} LIMIT 1`;
  const finalSkillId = (existing?.id as string) ?? skillId;

  // FK → skills.id WITHOUT onDelete cascade — this is the bug condition under test
  await sql`
    INSERT INTO skill_versions (id, skill_id, version, integrity, tarball_path, tarball_size, file_count, manifest, permissions, audit_status, published_by, created_at)
    VALUES (
      ${versionId}, ${finalSkillId}, ${'1.0.0'},
      ${'sha512-bdd-delete-test'}, ${'skills/test/delete-test-1.0.0.tgz'},
      ${512}, ${3},
      ${JSON.stringify({ name, description: 'BDD delete test', version: '1.0.0' })},
      ${JSON.stringify({})}, ${'pending'}, ${publisherId}, ${now}
    )
  `;

  await sql`
    INSERT INTO skill_access (id, skill_id, granted_user_id, granted_by, created_at)
    VALUES (${accessId}, ${finalSkillId}, ${publisherId}, ${publisherId}, ${now})
    ON CONFLICT DO NOTHING
  `;

  return { skillId: finalSkillId, skillName: name, versionId, accessId };
}

async function givenTestSkillExists(name: string): Promise<void> {
  const sql = requireSql();
  const now = new Date();
  const publisherId = `pkg-pub-${world.runId}`;
  const skillId = randomUUID();

  await sql`
    INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
    VALUES (${publisherId}, ${'BDD Pkg Publisher'}, ${`pkg-pub-${world.runId}@tank.test`}, true, ${now}, ${now})
    ON CONFLICT (id) DO NOTHING
  `;

  await sql`
    INSERT INTO skills (id, name, description, publisher_id, status, visibility, created_at, updated_at)
    VALUES (${skillId}, ${name}, ${'BDD admin packages test'}, ${publisherId}, ${'active'}, ${'public'}, ${now}, ${now})
    ON CONFLICT (name) DO UPDATE SET updated_at = ${now}
  `;

  const [existing] = await sql`SELECT id FROM skills WHERE name = ${name} LIMIT 1`;
  world.testSkillId = (existing?.id as string) ?? skillId;
  world.testSkillName = name;
}

// ── Feature ────────────────────────────────────────────────────────────────

describe('Feature: Admin package catalog management', () => {
  beforeAll(async () => {
    if (!hasDatabase || !hasRegistry) return;
    const connectionString = requireDatabaseUrl();
    world.sql = postgres(connectionString);
    world.runId = randomUUID().replace(/-/g, '').slice(0, 10);
    world.client = createAdminApiClient(world.registry, world.sql);
    await createAdminSession(world.client, world.runId);
    await givenTestSkillExists(`@bdd-pkg-org-${world.runId}/admin-pkg-search-target`);
  }, 30_000);

  afterAll(async () => {
    const sql = world.sql;
    if (!sql) return;
    try {
      if (world.client) await cleanupAdminSession(world.client, world.runId);
      const publisherId = `pkg-pub-${world.runId}`;
      const skillIds = sql`SELECT id FROM skills WHERE publisher_id = ${publisherId}`;
      await sql`DELETE FROM skill_versions WHERE skill_id IN (${skillIds})`;
      await sql`DELETE FROM skills WHERE publisher_id = ${publisherId}`;
      await sql`DELETE FROM "user" WHERE id = ${publisherId}`;
    } catch (_e) {
    } finally {
      await sql.end();
    }
  }, 15_000);

  // ── Auth enforcement (C1) ─────────────────────────────────────────

  describe('Scenario: GET /admin/packages as non-admin returns 401', () => {
    it.skipIf(!hasDatabase || !hasRegistry)('runs Given/When/Then', async () => {
      const { status } = await adminGet('/api/admin/packages');
      expect(status).toBe(401);
    });
  });

  // ── List packages (C2, C4) ────────────────────────────────────────

  describe('Scenario: GET /admin/packages returns paginated package list with publisher info (E1)', () => {
    it.skipIf(!hasDatabase || !hasRegistry)('runs Given/When/Then', async () => {
      const { status, body } = await adminGet('/api/admin/packages', world.client?.session?.cookieHeader);
      expect(status).toBe(200);
      const b = body as Record<string, unknown>;
      expect(b).toHaveProperty('packages');
      expect(b).toHaveProperty('total');
      const packages = b.packages as Array<Record<string, unknown>>;
      expect(Array.isArray(packages)).toBe(true);
      for (const pkg of packages.slice(0, 3)) {
        expect(pkg).toHaveProperty('publisher');
        const publisher = pkg.publisher as Record<string, unknown>;
        expect(publisher).toHaveProperty('name');
        expect(publisher).toHaveProperty('email');
      }
    });
  });

  // ── Search filter (C2) ────────────────────────────────────────────

  describe('Scenario: Search by name filters results (E4)', () => {
    it.skipIf(!hasDatabase || !hasRegistry)('runs Given/When/Then', async () => {
      const { status, body } = await adminGet(
        `/api/admin/packages?search=admin-pkg-search-target`,
        world.client?.session?.cookieHeader
      );
      expect(status).toBe(200);
      const packages = (body as Record<string, unknown>).packages as Array<Record<string, unknown>>;
      expect(Array.isArray(packages)).toBe(true);
      const found = packages.some((p) => (p.name as string).includes('admin-pkg-search-target'));
      expect(found).toBe(true);
    });
  });

  // ── Status filter validation (C3) ────────────────────────────────

  describe('Scenario: Invalid status filter returns 400 (E3)', () => {
    it.skipIf(!hasDatabase || !hasRegistry)('runs Given/When/Then', async () => {
      const { status, body } = await adminGet(
        '/api/admin/packages?status=invalid-status',
        world.client?.session?.cookieHeader
      );
      expect(status).toBe(400);
      const bodyStr = JSON.stringify(body).toLowerCase();
      expect(bodyStr).toMatch(/active|deprecated|quarantined|removed/);
    });
  });

  // ── Featured filter (C2) ─────────────────────────────────────────

  describe('Scenario: Filter by featured=true returns only featured packages', () => {
    it.skipIf(!hasDatabase || !hasRegistry)('runs Given/When/Then', async () => {
      const { status, body } = await adminGet('/api/admin/packages?featured=true', world.client?.session?.cookieHeader);
      expect(status).toBe(200);
      const packages = (body as Record<string, unknown>).packages as Array<Record<string, unknown>>;
      expect(Array.isArray(packages)).toBe(true);
      for (const pkg of packages) {
        expect(pkg.featured).toBe(true);
      }
    });
  });

  // ── Delete package with relations (C6) ──────────────────────────

  describe('Scenario: DELETE /admin/packages/:name cascades to versions and access grants (E6)', () => {
    let deleteTestIds: DeleteTestIds;

    it.skipIf(!hasDatabase || !hasRegistry)('runs Given/When/Then', async () => {
      const skillName = `@bdd-pkg-org-${world.runId}/admin-pkg-delete-target`;
      deleteTestIds = await givenTestSkillWithRelations(skillName);

      const { status } = await adminDelete(
        `/api/admin/packages/${encodeURIComponent(skillName)}`,
        world.client?.session?.cookieHeader
      );
      expect(status).toBe(200);

      const sql = requireSql();
      const [skill] = await sql`SELECT id FROM skills WHERE id = ${deleteTestIds.skillId}`;
      expect(skill).toBeUndefined();

      const versions = await sql`SELECT id FROM skill_versions WHERE skill_id = ${deleteTestIds.skillId}`;
      expect(versions).toHaveLength(0);

      const access = await sql`SELECT id FROM skill_access WHERE skill_id = ${deleteTestIds.skillId}`;
      expect(access).toHaveLength(0);
    });
  });

  // ── Delete non-existent package (C7) ────────────────────────────

  describe('Scenario: DELETE non-existent package returns 404 (E7)', () => {
    it.skipIf(!hasDatabase || !hasRegistry)('runs Given/When/Then', async () => {
      const { status } = await adminDelete(
        '/api/admin/packages/%40nonexistent%2Fdoes-not-exist',
        world.client?.session?.cookieHeader
      );
      expect(status).toBe(404);
    });
  });
});
