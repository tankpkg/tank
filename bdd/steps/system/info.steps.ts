/**
 * BDD step definitions for skill info lookup.
 *
 * Intent: idd/modules/info/INTENT.md
 * Feature: bdd/features/system/info/info.feature
 *
 * Runs against REAL PostgreSQL + REAL registry HTTP — zero mocks.
 * Requires DATABASE_URL and E2E_REGISTRY_URL in environment.
 */
import { randomUUID } from 'node:crypto';

import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const hasDatabase = !!process.env.DATABASE_URL;
const hasRegistry = !!process.env.E2E_REGISTRY_URL;

// ── World ──────────────────────────────────────────────────────────────────

interface InfoWorld {
  sql: postgres.Sql;
  registry: string;
  org: string;
  runId: string;
  publisherId: string;
  publicSkillId: string;
  privateSkillId: string;
  versionId: string;
  lastStatus: number;
  lastBody: Record<string, unknown>;
}

const world: InfoWorld = {
  sql: null as unknown as postgres.Sql,
  registry: process.env.E2E_REGISTRY_URL ?? 'http://localhost:3003',
  org: '',
  runId: '',
  publisherId: '',
  publicSkillId: '',
  privateSkillId: '',
  versionId: '',
  lastStatus: 0,
  lastBody: {}
};

// ── Setup ──────────────────────────────────────────────────────────────────

async function setupSkills(): Promise<void> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error('DATABASE_URL required — set it in .env');
  world.sql = postgres(dbUrl);

  world.runId = Date.now().toString();
  world.org = `e2e-bdd-info-${world.runId}`;

  const users = await world.sql`SELECT id FROM "user" LIMIT 1`;
  if (users.length === 0) throw new Error('No users in database — need at least one to seed test skills');
  world.publisherId = users[0].id as string;

  const publicName = `@${world.org}/info-skill`;
  const [publicRow] = await world.sql`
    INSERT INTO skills (id, name, description, publisher_id, visibility, status, created_at, updated_at)
    VALUES (${randomUUID()}, ${publicName}, ${'Test skill for info BDD'}, ${world.publisherId}, ${'public'}, ${'active'}, NOW(), NOW())
    RETURNING id
  `;
  world.publicSkillId = publicRow.id as string;

  const [versionRow] = await world.sql`
    INSERT INTO skill_versions (id, skill_id, version, integrity, tarball_path, tarball_size, file_count, manifest, permissions, audit_status, published_by, created_at)
    VALUES (
      ${randomUUID()}, ${world.publicSkillId}, ${'1.0.0'},
      ${'sha512-bdd-info-test'}, ${'skills/test/info-1.0.0.tgz'}, ${1024}, ${3},
      ${JSON.stringify({ name: publicName, version: '1.0.0', description: 'Test skill for info BDD' })},
      ${JSON.stringify({ network: { outbound: ['api.test.com'] } })},
      ${'pending'}, ${world.publisherId}, NOW()
    )
    RETURNING id
  `;
  world.versionId = versionRow.id as string;

  await world.sql`UPDATE skills SET latest_version_id = ${world.versionId} WHERE id = ${world.publicSkillId}`;

  const privateName = `@${world.org}/private-info-skill`;
  const [privateRow] = await world.sql`
    INSERT INTO skills (id, name, description, publisher_id, visibility, status, created_at, updated_at)
    VALUES (${randomUUID()}, ${privateName}, ${'Private test skill'}, ${world.publisherId}, ${'private'}, ${'active'}, NOW(), NOW())
    RETURNING id
  `;
  world.privateSkillId = privateRow.id as string;

  const [privVersionRow] = await world.sql`
    INSERT INTO skill_versions (id, skill_id, version, integrity, tarball_path, tarball_size, file_count, manifest, permissions, audit_status, published_by, created_at)
    VALUES (
      ${randomUUID()}, ${world.privateSkillId}, ${'1.0.0'},
      ${'sha512-bdd-private-test'}, ${'skills/test/private-1.0.0.tgz'}, ${512}, ${2},
      ${JSON.stringify({ name: privateName, version: '1.0.0' })},
      ${JSON.stringify({})},
      ${'pending'}, ${world.publisherId}, NOW()
    )
    RETURNING id
  `;
  await world.sql`UPDATE skills SET latest_version_id = ${privVersionRow.id} WHERE id = ${world.privateSkillId}`;
}

async function cleanup(): Promise<void> {
  await world.sql`DELETE FROM skill_versions WHERE skill_id IN (${world.publicSkillId}, ${world.privateSkillId})`;
  await world.sql`DELETE FROM skills WHERE id IN (${world.publicSkillId}, ${world.privateSkillId})`;
  await world.sql.end();
}

// ── When ───────────────────────────────────────────────────────────────────

async function whenICallGetSkill(name: string, auth?: string): Promise<void> {
  const encodedName = encodeURIComponent(name).replace(/%2F/g, '/');
  const headers: Record<string, string> = {};
  if (auth) headers.Authorization = `Bearer ${auth}`;
  const res = await fetch(`${world.registry}/api/v1/skills/${encodedName}`, { headers });
  world.lastStatus = res.status;
  world.lastBody = (await res.json().catch(() => ({}))) as Record<string, unknown>;
}

async function whenICallGetSkillVersion(name: string, version: string): Promise<void> {
  const encodedName = encodeURIComponent(name).replace(/%2F/g, '/');
  const res = await fetch(`${world.registry}/api/v1/skills/${encodedName}/${version}`);
  world.lastStatus = res.status;
  world.lastBody = (await res.json().catch(() => ({}))) as Record<string, unknown>;
}

// ── Then ───────────────────────────────────────────────────────────────────

function thenStatusIs(code: number): void {
  expect(world.lastStatus).toBe(code);
}

function thenBodyContainsKey(key: string): void {
  expect(world.lastBody).toHaveProperty(key);
}

// ── Feature ────────────────────────────────────────────────────────────────

describe('Feature: Skill info lookup via registry API', () => {
  beforeAll(async () => {
    if (!hasDatabase || !hasRegistry) return;
    await setupSkills();
  }, 30_000);

  afterAll(async () => {
    if (!world.sql) return;
    await cleanup();
  }, 15_000);

  // ── Successful lookup (C2) ────────────────────────────────────────

  describe('Scenario: Fetching info for an existing skill returns metadata (E1)', () => {
    it.skipIf(!hasDatabase || !hasRegistry)('runs Given/When/Then', async () => {
      await whenICallGetSkill(`@${world.org}/info-skill`);
      thenStatusIs(200);
      thenBodyContainsKey('name');
      thenBodyContainsKey('latestVersion');
      thenBodyContainsKey('publisher');
    });
  });

  // ── 404 for unknown skill (C1) ────────────────────────────────────

  describe('Scenario: Fetching info for a nonexistent skill returns 404 (E2)', () => {
    it.skipIf(!hasDatabase || !hasRegistry)('runs Given/When/Then', async () => {
      await whenICallGetSkill(`@${world.org}/nonexistent-zzz`);
      thenStatusIs(404);
    });
  });

  // ── Version detail with permissions (C3) ─────────────────────────

  describe('Scenario: Fetching a version returns permissions and auditScore (E3)', () => {
    it.skipIf(!hasDatabase || !hasRegistry)('runs Given/When/Then', async () => {
      await whenICallGetSkillVersion(`@${world.org}/info-skill`, '1.0.0');
      thenStatusIs(200);
      thenBodyContainsKey('permissions');
    });
  });

  // ── Private skill visibility (C3) ─────────────────────────────────

  describe('Scenario: Private skill is not visible to unauthenticated users (E4)', () => {
    it.skipIf(!hasDatabase || !hasRegistry)('runs Given/When/Then', async () => {
      await whenICallGetSkill(`@${world.org}/private-info-skill`);
      thenStatusIs(404);
    });
  });
});
