/**
 * BDD step definitions for admin organization management.
 *
 * Intent: .idd/modules/admin-orgs/INTENT.md
 * Feature: .bdd/features/admin-orgs/orgs.feature
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
} from '../interactions/admin-api-client.js';

// ── World ──────────────────────────────────────────────────────────────────

interface AdminOrgsWorld {
  registry: string;
  sql: postgres.Sql | null;
  runId: string;
  client: AdminApiClient | null;
  testOrgId: string;
}

const world: AdminOrgsWorld = {
  registry: process.env.E2E_REGISTRY_URL ?? 'http://localhost:3003',
  sql: null,
  runId: '',
  client: null,
  testOrgId: ''
};

// ── Helpers ────────────────────────────────────────────────────────────────

async function adminGet(path: string, cookieHeader?: string): Promise<{ status: number; body: unknown }> {
  const headers: Record<string, string> = {};
  if (cookieHeader) headers['Cookie'] = cookieHeader;
  const res = await fetch(`${world.registry}${path}`, { headers });
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { status: res.status, body };
}

// ── Given ──────────────────────────────────────────────────────────────────

async function givenTestOrgWithMembersExists(): Promise<void> {
  const sql = world.sql!;
  const now = new Date();
  const orgId = `test-org-${world.runId}`;
  const userId = `test-org-user-${world.runId}`;
  const memberId = `test-org-mem-${world.runId}`;

  await sql`
    INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
    VALUES (${userId}, ${'BDD Org Member'}, ${`org-member-${world.runId}@tank.test`}, true, ${now}, ${now})
    ON CONFLICT (id) DO NOTHING
  `;

  await sql`
    INSERT INTO "organization" (id, name, slug, created_at)
    VALUES (${orgId}, ${'BDD Test Org'}, ${`bdd-test-org-${world.runId}`}, ${now})
    ON CONFLICT (id) DO NOTHING
  `;
  world.testOrgId = orgId;

  await sql`
    INSERT INTO "member" (id, organization_id, user_id, role, created_at)
    VALUES (${memberId}, ${orgId}, ${userId}, ${'owner'}, ${now})
    ON CONFLICT (id) DO NOTHING
  `;
}

// ── Feature ────────────────────────────────────────────────────────────────

describe('Feature: Admin organization management', () => {
  beforeAll(async () => {
    if (!hasDatabase || !hasRegistry) return;
    const connectionString = process.env.DATABASE_URL!;
    world.sql = postgres(connectionString);
    world.runId = randomUUID().replace(/-/g, '').slice(0, 10);
    world.client = createAdminApiClient(world.registry, world.sql);
    await createAdminSession(world.client, world.runId);
    await givenTestOrgWithMembersExists();
  }, 30_000);

  afterAll(async () => {
    const sql = world.sql;
    if (!sql) return;
    try {
      if (world.client) await cleanupAdminSession(world.client, world.runId);
      const orgId = `test-org-${world.runId}`;
      const userId = `test-org-user-${world.runId}`;
      const memberId = `test-org-mem-${world.runId}`;
      await sql`DELETE FROM "member" WHERE id = ${memberId}`;
      await sql`DELETE FROM "organization" WHERE id = ${orgId}`;
      await sql`DELETE FROM "user" WHERE id = ${userId}`;
    } catch (e) {
      console.warn('admin-orgs cleanup warning:', e);
    } finally {
      await sql.end();
    }
  }, 15_000);

  // ── Auth enforcement (C1) ─────────────────────────────────────────

  describe('Scenario: GET /admin/orgs as non-admin returns 401 (E2)', () => {
    it.skipIf(!hasDatabase || !hasRegistry)('runs Given/When/Then', async () => {
      const { status } = await adminGet('/api/admin/orgs');
      expect(status).toBe(401);
    });
  });

  // ── List orgs (C2) ────────────────────────────────────────────────

  describe('Scenario: GET /admin/orgs returns paginated org list (E1)', () => {
    it.skipIf(!hasDatabase || !hasRegistry)('runs Given/When/Then', async () => {
      const { status, body } = await adminGet('/api/admin/orgs', world.client!.session!.cookieHeader);
      expect(status).toBe(200);
      const b = body as Record<string, unknown>;
      expect(b).toHaveProperty('orgs');
      expect(b).toHaveProperty('total');
      expect(Array.isArray(b['orgs'])).toBe(true);
    });
  });

  // ── Org detail (C3) ───────────────────────────────────────────────

  describe('Scenario: GET /admin/orgs/[id] returns org detail with members (E3)', () => {
    it.skipIf(!hasDatabase || !hasRegistry)('runs Given/When/Then', async () => {
      const { status, body } = await adminGet(
        `/api/admin/orgs/${world.testOrgId}`,
        world.client!.session!.cookieHeader
      );
      expect(status).toBe(200);
      const b = body as Record<string, unknown>;
      expect(b).toHaveProperty('id');
      expect(b).toHaveProperty('members');
      const members = b['members'] as unknown[];
      expect(Array.isArray(members)).toBe(true);
      expect(members.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ── 404 for unknown org (C3) ──────────────────────────────────────

  describe('Scenario: GET /admin/orgs/[id] returns 404 for unknown org', () => {
    it.skipIf(!hasDatabase || !hasRegistry)('runs Given/When/Then', async () => {
      const { status } = await adminGet(`/api/admin/orgs/nonexistent-org-bdd-zzz`, world.client!.session!.cookieHeader);
      expect(status).toBe(404);
    });
  });
});
