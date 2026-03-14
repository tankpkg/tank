/**
 * BDD step definitions for the audit score SVG badge endpoint.
 *
 * Intent: .idd/modules/badge/INTENT.md
 * Feature: .bdd/features/badge/badge.feature
 *
 * Runs against REAL PostgreSQL + REAL registry HTTP — zero mocks.
 * Requires DATABASE_URL and E2E_REGISTRY_URL in environment.
 * Seeds a test skill with an audit score directly via SQL; reads via badge endpoint.
 */
import { randomUUID } from 'node:crypto';

import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const hasDatabase = !!process.env.DATABASE_URL;
const hasRegistry = !!process.env.E2E_REGISTRY_URL;

// ── World ──────────────────────────────────────────────────────────────────

interface BadgeWorld {
  registry: string;
  sql: postgres.Sql | null;
  runId: string;
  testOrg: string;
  skillName: string;
  auditScore: number;
  lastStatus: number;
  lastBody: string;
  lastContentType: string;
}

const world: BadgeWorld = {
  registry: process.env.E2E_REGISTRY_URL ?? 'http://localhost:3003',
  sql: null,
  runId: '',
  testOrg: '',
  skillName: '',
  auditScore: 8.5,
  lastStatus: 0,
  lastBody: '',
  lastContentType: ''
};

// ── Helpers ────────────────────────────────────────────────────────────────

async function getBadge(path: string): Promise<{ status: number; body: string; contentType: string }> {
  const res = await fetch(`${world.registry}${path}`);
  const body = await res.text();
  const contentType = res.headers.get('content-type') ?? '';
  return { status: res.status, body, contentType };
}

async function seedSkillWithScore(sql: postgres.Sql, name: string, version: string, auditScore: number): Promise<void> {
  const now = new Date();
  const publisherId = `badge-pub-${world.runId}`;
  const orgId = `badge-org-${world.runId}`;
  const skillId = randomUUID();
  const versionId = randomUUID();

  await sql`
    INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
    VALUES (${publisherId}, ${'Badge BDD User'}, ${`badge-bdd-${world.runId}@tank.test`}, true, ${now}, ${now})
    ON CONFLICT (id) DO NOTHING
  `;

  await sql`
    INSERT INTO "organization" (id, name, slug, created_at)
    VALUES (${orgId}, ${'Badge BDD Org'}, ${world.testOrg}, ${now})
    ON CONFLICT (slug) DO NOTHING
  `;

  await sql`
    INSERT INTO "member" (id, organization_id, user_id, role, created_at)
    VALUES (${`badge-mem-${world.runId}`}, ${orgId}, ${publisherId}, ${'owner'}, ${now})
    ON CONFLICT DO NOTHING
  `;

  await sql`
    INSERT INTO skills (id, name, description, publisher_id, org_id, status, visibility, created_at, updated_at)
    VALUES (
      ${skillId}, ${name}, ${'Badge BDD test skill'},
      ${publisherId}, ${orgId}, ${'active'}, ${'public'}, ${now}, ${now}
    )
    ON CONFLICT (name) DO UPDATE SET updated_at = ${now}
  `;

  await sql`
    INSERT INTO skill_versions (
      id, skill_id, version, integrity, tarball_path, tarball_size, file_count,
      manifest, permissions, audit_status, audit_score, published_by, created_at
    )
    VALUES (
      ${versionId}, ${skillId}, ${version},
      ${'sha512-bdd-badge-test'},
      ${'skills/badge-bdd/test-1.0.0.tgz'},
      ${512}, ${3},
      ${JSON.stringify({ name, version, description: 'BDD badge test' })},
      ${JSON.stringify({})},
      ${'completed'},
      ${auditScore},
      ${publisherId},
      ${now}
    )
    ON CONFLICT DO NOTHING
  `;
}

async function cleanupBadgeData(sql: postgres.Sql): Promise<void> {
  const orgSlug = world.testOrg;
  if (!orgSlug) return;

  await sql`DELETE FROM skill_versions WHERE tarball_path LIKE ${'skills/badge-bdd/%'}`;
  await sql`DELETE FROM skills WHERE name LIKE ${`@${orgSlug}/%`}`;
  await sql`DELETE FROM "member" WHERE id LIKE ${'badge-mem-%'}`;
  await sql`DELETE FROM "organization" WHERE slug = ${orgSlug}`;
  await sql`DELETE FROM "user" WHERE id LIKE ${'badge-pub-%'}`;
}

// ── Feature ────────────────────────────────────────────────────────────────

describe('Feature: Audit score SVG badge', () => {
  beforeAll(async () => {
    if (!hasDatabase || !hasRegistry) return;
    const connectionString = process.env.DATABASE_URL!;

    world.sql = postgres(connectionString);
    world.runId = randomUUID().replace(/-/g, '').slice(0, 10);
    world.testOrg = `badge-bdd-${world.runId}`;
    world.skillName = `@${world.testOrg}/badge-skill`;

    await seedSkillWithScore(world.sql, world.skillName, '1.0.0', world.auditScore);
  }, 30_000);

  afterAll(async () => {
    if (world.sql) {
      await cleanupBadgeData(world.sql);
      await world.sql.end();
    }
  }, 15_000);

  // ── SVG content type (C1) ─────────────────────────────────────────────

  describe('Scenario: Badge response has Content-Type image/svg+xml (E3)', () => {
    it.skipIf(!hasDatabase || !hasRegistry)('returns svg+xml content-type', async () => {
      const encoded = encodeURIComponent(world.skillName).replace(/%40/g, '@');
      const { status, contentType } = await getBadge(`/api/v1/badge/${encoded}`);
      world.lastStatus = status;
      world.lastContentType = contentType;
      expect(contentType).toContain('image/svg+xml');
    });
  });

  // ── Badge for known skill (C2) ────────────────────────────────────────

  describe('Scenario: Badge for known skill contains the audit score (E1)', () => {
    it.skipIf(!hasDatabase || !hasRegistry)('returns 200', async () => {
      const encoded = encodeURIComponent(world.skillName).replace(/%40/g, '@');
      const { status, body, contentType } = await getBadge(`/api/v1/badge/${encoded}`);
      world.lastStatus = status;
      world.lastBody = body;
      world.lastContentType = contentType;
      expect(status).toBe(200);
    });

    it.skipIf(!hasDatabase || !hasRegistry)('SVG body contains the audit score value', () => {
      // Badge renders e.g. "8.5/10" for score 8.5
      const scoreText = `${world.auditScore}/10`;
      expect(world.lastBody).toContain(scoreText);
    });
  });

  // ── Badge for unknown skill (C3) ─────────────────────────────────────

  describe('Scenario: Badge for unknown skill returns a badge (not 404) (E2)', () => {
    it.skipIf(!hasRegistry)('returns 200', async () => {
      const { status } = await getBadge(`/api/v1/badge/@${world.testOrg}/nonexistent-badge-skill`);
      world.lastStatus = status;
      // Badge endpoint returns SVG even for unknown skills (with "not found" text)
      // The feature says response is 200 and content-type is svg+xml
      expect(status).toBe(200);
    });

    it.skipIf(!hasRegistry)('Content-Type is image/svg+xml', async () => {
      const { contentType } = await getBadge(`/api/v1/badge/@${world.testOrg}/nonexistent-badge-skill`);
      expect(contentType).toContain('image/svg+xml');
    });
  });
});
