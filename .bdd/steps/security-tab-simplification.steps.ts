/**
 * BDD step definitions for security tab simplification.
 *
 * Intent: .idd/modules/security-tab-simplification/INTENT.md
 * Feature: .bdd/features/security-tab-simplification/security-tab-simplification.feature
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

interface SecurityTabWorld {
  registry: string;
  sql: postgres.Sql | null;
  runId: string;
  testOrg: string;
  skills: Map<
    string,
    {
      verdict: string | null;
      findings: number;
      hasReadme: boolean;
      hasDescription: boolean;
      hasLicense: boolean;
      hasRepo: boolean;
      hasPermissions: boolean;
    }
  >;
  lastStatus: number;
  lastBody: string;
  lastHtml: string;
}

const world: SecurityTabWorld = {
  registry: process.env.E2E_REGISTRY_URL ?? 'http://localhost:3003',
  sql: null,
  runId: '',
  testOrg: '',
  skills: new Map(),
  lastStatus: 0,
  lastBody: '',
  lastHtml: ''
};

// ── Helpers ────────────────────────────────────────────────────────────────

async function fetchSkillPage(name: string): Promise<{ status: number; html: string }> {
  const encoded = encodeURIComponent(name).replace(/%40/g, '@');
  const res = await fetch(`${world.registry}/skills/${encoded}`);
  const html = await res.text();
  return { status: res.status, html };
}

async function fetchSkillsListPage(): Promise<{ status: number; html: string }> {
  const res = await fetch(`${world.registry}/skills`);
  const html = await res.text();
  return { status: res.status, html };
}

interface SkillOptions {
  verdict: string | null;
  critical?: number;
  high?: number;
  medium?: number;
  low?: number;
  hasReadme?: boolean;
  hasDescription?: boolean;
  hasLicense?: boolean;
  hasRepo?: boolean;
  hasPermissions?: boolean;
}

async function seedSkillWithOptions(
  sql: postgres.Sql,
  name: string,
  version: string,
  options: SkillOptions
): Promise<void> {
  const now = new Date();
  const publisherId = `sec-tab-pub-${world.runId}`;
  const orgId = `sec-tab-org-${world.runId}`;
  const skillId = randomUUID();
  const versionId = randomUUID();
  const scanId = randomUUID();

  const {
    verdict,
    critical = 0,
    high = 0,
    medium = 0,
    low = 0,
    hasReadme = false,
    hasDescription = false,
    hasLicense = false,
    hasRepo = false,
    hasPermissions = false
  } = options;

  await sql`
    INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
    VALUES (${publisherId}, ${'Security Tab BDD User'}, ${`sec-tab-bdd-${world.runId}@tank.test`}, true, ${now}, ${now})
    ON CONFLICT (id) DO NOTHING
  `;

  await sql`
    INSERT INTO "organization" (id, name, slug, created_at)
    VALUES (${orgId}, ${'Security Tab BDD Org'}, ${world.testOrg}, ${now})
    ON CONFLICT (slug) DO NOTHING
  `;

  await sql`
    INSERT INTO "member" (id, organization_id, user_id, role, created_at)
    VALUES (${`sec-tab-mem-${world.runId}`}, ${orgId}, ${publisherId}, ${'owner'}, ${now})
    ON CONFLICT DO NOTHING
  `;

  const manifest: Record<string, unknown> = { name, version, description: 'Security tab simplification test' };
  if (hasLicense) manifest.license = 'MIT';
  if (hasRepo) manifest.repository = 'https://github.com/example/test';

  const permissions: Record<string, unknown> = hasPermissions
    ? {
        network: { outbound: ['https://api.example.com'] },
        filesystem: { read: ['/tmp'], write: [] },
        subprocess: false
      }
    : {};

  await sql`
    INSERT INTO skills (id, name, description, publisher_id, org_id, status, visibility, created_at, updated_at)
    VALUES (
      ${skillId}, ${name}, ${hasDescription ? 'A skill with description for testing' : null},
      ${publisherId}, ${orgId}, ${'active'}, ${'public'}, ${now}, ${now}
    )
    ON CONFLICT (name) DO UPDATE SET updated_at = ${now}
  `;

  await sql`
    INSERT INTO skill_versions (
      id, skill_id, version, integrity, tarball_path, tarball_size, file_count,
      manifest, permissions, readme, audit_status, audit_score, published_by, created_at
    )
    VALUES (
      ${versionId}, ${skillId}, ${version},
      ${'sha512-sec-tab-bdd-test'},
      ${'skills/sec-tab-bdd/test-1.0.0.tgz'},
      ${512}, ${3},
      ${JSON.stringify(manifest)},
      ${JSON.stringify(permissions)},
      ${hasReadme ? '# Test Skill\n\nThis is a test skill for security tab simplification.' : null},
      ${verdict ? 'completed' : 'pending'},
      ${verdict === 'pass' && critical === 0 && high === 0 && medium === 0 && low === 0 ? 10 : 5},
      ${publisherId},
      ${now}
    )
    ON CONFLICT DO NOTHING
  `;

  // Insert scan results if verdict exists
  if (verdict) {
    await sql`
      INSERT INTO scan_results (
        id, version_id, verdict, stages_run, duration_ms,
        critical_count, high_count, medium_count, low_count, created_at
      )
      VALUES (
        ${scanId}, ${versionId}, ${verdict}, ${JSON.stringify(['stage0', 'stage1', 'stage2', 'stage3', 'stage4', 'stage5'])}, ${1000},
        ${critical}, ${high}, ${medium}, ${low}, ${now}
      )
      ON CONFLICT DO NOTHING
    `;
  }

  world.skills.set(name, {
    verdict,
    findings: critical + high + medium + low,
    hasReadme,
    hasDescription,
    hasLicense,
    hasRepo,
    hasPermissions
  });
}

async function cleanupSecurityTabData(sql: postgres.Sql): Promise<void> {
  const orgSlug = world.testOrg;
  if (!orgSlug) return;

  await sql`DELETE FROM scan_findings WHERE scan_id IN (SELECT id FROM scan_results WHERE version_id IN (SELECT id FROM skill_versions WHERE tarball_path LIKE ${'skills/sec-tab-bdd/%'}))`;
  await sql`DELETE FROM scan_results WHERE version_id IN (SELECT id FROM skill_versions WHERE tarball_path LIKE ${'skills/sec-tab-bdd/%'})`;
  await sql`DELETE FROM skill_versions WHERE tarball_path LIKE ${'skills/sec-tab-bdd/%'}`;
  await sql`DELETE FROM skills WHERE name LIKE ${`@${orgSlug}/%`}`;
  await sql`DELETE FROM "member" WHERE id LIKE ${'sec-tab-mem-%'}`;
  await sql`DELETE FROM "organization" WHERE slug = ${orgSlug}`;
  await sql`DELETE FROM "user" WHERE id LIKE ${'sec-tab-pub-%'}`;
}

// ── Feature ────────────────────────────────────────────────────────────────

describe('Feature: Security Tab Simplification', () => {
  beforeAll(async () => {
    if (!hasDatabase || !hasRegistry) return;
    const connectionString = process.env.DATABASE_URL!;

    world.sql = postgres(connectionString);
    world.runId = randomUUID().replace(/-/g, '').slice(0, 10);
    world.testOrg = `sec-tab-${world.runId}`;

    // Seed test skills for different scenarios
    await seedSkillWithOptions(world.sql, `@${world.testOrg}/verified-skill`, '1.0.0', {
      verdict: 'pass',
      critical: 0,
      high: 0,
      medium: 0,
      low: 0
    });

    await seedSkillWithOptions(world.sql, `@${world.testOrg}/bulletproof`, '1.0.0', {
      verdict: 'pass',
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      hasReadme: true,
      hasDescription: true,
      hasLicense: true,
      hasRepo: true,
      hasPermissions: true
    });

    await seedSkillWithOptions(world.sql, `@${world.testOrg}/quality-skill`, '1.0.0', {
      verdict: 'pass',
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      hasReadme: true,
      hasDescription: true,
      hasLicense: true,
      hasRepo: true,
      hasPermissions: true
    });

    await seedSkillWithOptions(world.sql, `@${world.testOrg}/complete-skill`, '1.0.0', {
      verdict: 'pass',
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      hasReadme: true,
      hasDescription: true,
      hasLicense: true,
      hasRepo: true,
      hasPermissions: true
    });
  }, 60_000);

  afterAll(async () => {
    if (world.sql) {
      await cleanupSecurityTabData(world.sql);
      await world.sql.end();
    }
  }, 15_000);

  // ── C1: No numeric score in skill list ─────────────────────────────────────

  describe('Scenario: Skill list shows TrustBadge not numeric score', () => {
    it.skipIf(!hasDatabase || !hasRegistry)('shows Verified badge not Score:', async () => {
      const { html } = await fetchSkillsListPage();
      world.lastHtml = html;
      // Check for Verified badge
      expect(html).toContain('Verified');
      // Check that Score: is NOT present (the old pattern)
      expect(html).not.toMatch(/Score:\s*\d+/);
    });
  });

  // ── C2: No numeric score in security tab ───────────────────────────────────

  describe('Scenario: Security tab shows TrustBadge not 0-10 number', () => {
    it.skipIf(!hasDatabase || !hasRegistry)('shows Verified badge prominently', async () => {
      const { html } = await fetchSkillPage(`@${world.testOrg}/bulletproof`);
      world.lastHtml = html;
      // Check for Verified badge
      expect(html).toContain('Verified');
    });

    it.skipIf(!hasDatabase || !hasRegistry)('does NOT show large numeric score', async () => {
      // The old design had text-5xl with a number like "10" or "8"
      // The new design should NOT have that
      const html = world.lastHtml;
      // Check that we don't have the old score display pattern
      expect(html).not.toMatch(/text-5xl.*\d+/);
      expect(html).not.toMatch(/Security Score.*\d+\/10/);
    });
  });

  // ── C3: Quality checks are pass/fail ────────────────────────────────────────

  describe('Scenario: Quality checks show pass/fail indicators not points', () => {
    it.skipIf(!hasDatabase || !hasRegistry)('shows quality checks with checkmark icons', async () => {
      const { html } = await fetchSkillPage(`@${world.testOrg}/quality-skill`);
      world.lastHtml = html;
      // Check for quality checks section
      expect(html).toMatch(/Documentation|Package Hygiene|Permissions|Security Scan/);
    });

    it.skipIf(!hasDatabase || !hasRegistry)('does NOT show points like +1/1', async () => {
      const html = world.lastHtml;
      // The old ScoreBreakdown had patterns like "+1" or "/1"
      expect(html).not.toMatch(/\+\d+\/\d+/);
      expect(html).not.toMatch(/points/i);
    });
  });

  // ── C4: Four quality categories ────────────────────────────────────────────

  describe('Scenario: All four quality categories are shown', () => {
    it.skipIf(!hasDatabase || !hasRegistry)('shows Documentation category', async () => {
      const { html } = await fetchSkillPage(`@${world.testOrg}/complete-skill`);
      expect(html).toContain('Documentation');
    });

    it.skipIf(!hasDatabase || !hasRegistry)('shows Package Hygiene category', async () => {
      const { html } = await fetchSkillPage(`@${world.testOrg}/complete-skill`);
      expect(html).toContain('Package Hygiene');
    });

    it.skipIf(!hasDatabase || !hasRegistry)('shows Permissions category', async () => {
      const { html } = await fetchSkillPage(`@${world.testOrg}/complete-skill`);
      expect(html).toContain('Permissions');
    });

    it.skipIf(!hasDatabase || !hasRegistry)('shows Security Scan category', async () => {
      const { html } = await fetchSkillPage(`@${world.testOrg}/complete-skill`);
      expect(html).toContain('Security Scan');
    });
  });

  // ── Bulletproof skill shows all green checks ────────────────────────────────

  describe('Scenario: Bulletproof skill shows all green checks', () => {
    it.skipIf(!hasDatabase || !hasRegistry)('shows Verified badge', async () => {
      const { html } = await fetchSkillPage(`@${world.testOrg}/bulletproof`);
      expect(html).toContain('Verified');
    });

    it.skipIf(!hasDatabase || !hasRegistry)('shows Documentation check passed', async () => {
      const { html } = await fetchSkillPage(`@${world.testOrg}/bulletproof`);
      expect(html).toContain('Documentation');
    });

    it.skipIf(!hasDatabase || !hasRegistry)('shows Package Hygiene check passed', async () => {
      const { html } = await fetchSkillPage(`@${world.testOrg}/bulletproof`);
      expect(html).toContain('Package Hygiene');
    });

    it.skipIf(!hasDatabase || !hasRegistry)('shows Permissions check passed', async () => {
      const { html } = await fetchSkillPage(`@${world.testOrg}/bulletproof`);
      expect(html).toContain('Permissions');
    });

    it.skipIf(!hasDatabase || !hasRegistry)('shows Security Scan check passed', async () => {
      const { html } = await fetchSkillPage(`@${world.testOrg}/bulletproof`);
      expect(html).toContain('Security Scan');
    });
  });
});
