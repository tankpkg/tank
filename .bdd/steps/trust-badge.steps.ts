/**
 * BDD step definitions for the trust badge system.
 *
 * Intent: .idd/modules/trust-badge/INTENT.md
 * Feature: .bdd/features/trust-badge/trust-badge.feature
 *
 * Runs against REAL PostgreSQL + REAL registry HTTP — zero mocks.
 * Requires DATABASE_URL and E2E_REGISTRY_URL in environment.
 */
import { randomUUID } from "node:crypto";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import postgres from "postgres";

const hasDatabase = !!process.env.DATABASE_URL;
const hasRegistry = !!process.env.E2E_REGISTRY_URL;

// ── World ──────────────────────────────────────────────────────────────────

interface TrustBadgeWorld {
  registry: string;
  sql: postgres.Sql | null;
  runId: string;
  testOrg: string;
  skills: Map<string, { verdict: string | null; findings: number }>;
  lastStatus: number;
  lastBody: string;
  lastHtml: string;
}

const world: TrustBadgeWorld = {
  registry: process.env.E2E_REGISTRY_URL ?? "http://localhost:3003",
  sql: null,
  runId: "",
  testOrg: "",
  skills: new Map(),
  lastStatus: 0,
  lastBody: "",
  lastHtml: "",
};

// ── Helpers ────────────────────────────────────────────────────────────────

async function fetchSkillPage(name: string): Promise<{ status: number; html: string }> {
  const encoded = encodeURIComponent(name).replace(/%40/g, "@");
  const res = await fetch(`${world.registry}/skills/${encoded}`);
  const html = await res.text();
  return { status: res.status, html };
}

async function fetchBadge(name: string): Promise<{ status: number; body: string }> {
  const encoded = encodeURIComponent(name).replace(/%40/g, "@");
  const res = await fetch(`${world.registry}/api/v1/badge/${encoded}`);
  const body = await res.text();
  return { status: res.status, body };
}

async function seedSkillWithVerdict(
  sql: postgres.Sql,
  name: string,
  version: string,
  verdict: string | null,
  findings: { critical: number; high: number; medium: number; low: number }
): Promise<void> {
  const now = new Date();
  const publisherId = `trust-pub-${world.runId}`;
  const orgId = `trust-org-${world.runId}`;
  const skillId = randomUUID();
  const versionId = randomUUID();
  const scanId = randomUUID();

  await sql`
    INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
    VALUES (${publisherId}, ${"Trust BDD User"}, ${`trust-bdd-${world.runId}@tank.test`}, true, ${now}, ${now})
    ON CONFLICT (id) DO NOTHING
  `;

  await sql`
    INSERT INTO "organization" (id, name, slug, created_at)
    VALUES (${orgId}, ${"Trust BDD Org"}, ${world.testOrg}, ${now})
    ON CONFLICT (slug) DO NOTHING
  `;

  await sql`
    INSERT INTO "member" (id, organization_id, user_id, role, created_at)
    VALUES (${`trust-mem-${world.runId}`}, ${orgId}, ${publisherId}, ${"owner"}, ${now})
    ON CONFLICT DO NOTHING
  `;

  await sql`
    INSERT INTO skills (id, name, description, publisher_id, org_id, status, visibility, created_at, updated_at)
    VALUES (
      ${skillId}, ${name}, ${"Trust BDD test skill"},
      ${publisherId}, ${orgId}, ${"active"}, ${"public"}, ${now}, ${now}
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
      ${"sha512-trust-bdd-test"},
      ${"skills/trust-bdd/test-1.0.0.tgz"},
      ${512}, ${3},
      ${JSON.stringify({ name, version, description: "BDD trust badge test" })},
      ${JSON.stringify({})},
      ${verdict ? "completed" : "pending"},
      ${verdict === "pass" && findings.critical === 0 && findings.high === 0 && findings.medium === 0 && findings.low === 0 ? 10 : 5},
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
        ${scanId}, ${versionId}, ${verdict}, ${JSON.stringify(["static"])}, ${1000},
        ${findings.critical}, ${findings.high}, ${findings.medium}, ${findings.low}, ${now}
      )
      ON CONFLICT DO NOTHING
    `;
  }

  world.skills.set(name, { verdict, findings: findings.critical + findings.high + findings.medium + findings.low });
}

async function cleanupTrustBadgeData(sql: postgres.Sql): Promise<void> {
  const orgSlug = world.testOrg;
  if (!orgSlug) return;

  await sql`DELETE FROM scan_findings WHERE scan_id IN (SELECT id FROM scan_results WHERE version_id IN (SELECT id FROM skill_versions WHERE tarball_path LIKE ${"skills/trust-bdd/%"}))`;
  await sql`DELETE FROM scan_results WHERE version_id IN (SELECT id FROM skill_versions WHERE tarball_path LIKE ${"skills/trust-bdd/%"})`;
  await sql`DELETE FROM skill_versions WHERE tarball_path LIKE ${"skills/trust-bdd/%"}`;
  await sql`DELETE FROM skills WHERE name LIKE ${`@${orgSlug}/%`}`;
  await sql`DELETE FROM "member" WHERE id LIKE ${"trust-mem-%"}`;
  await sql`DELETE FROM "organization" WHERE slug = ${orgSlug}`;
  await sql`DELETE FROM "user" WHERE id LIKE ${"trust-pub-%"}`;
}

// ── Feature ────────────────────────────────────────────────────────────────

describe("Feature: Trust Badge Display", () => {
  beforeAll(async () => {
    if (!hasDatabase || !hasRegistry) return;
    const connectionString = process.env.DATABASE_URL!;

    world.sql = postgres(connectionString);
    world.runId = randomUUID().replace(/-/g, "").slice(0, 10);
    world.testOrg = `trust-bdd-${world.runId}`;

    // Seed test skills for different trust levels
    await seedSkillWithVerdict(world.sql, `@${world.testOrg}/verified-skill`, "1.0.0", "pass", { critical: 0, high: 0, medium: 0, low: 0 });
    await seedSkillWithVerdict(world.sql, `@${world.testOrg}/review-skill`, "1.0.0", "pass_with_notes", { critical: 0, high: 0, medium: 2, low: 0 });
    await seedSkillWithVerdict(world.sql, `@${world.testOrg}/flagged-skill`, "1.0.0", "flagged", { critical: 0, high: 1, medium: 0, low: 0 });
    await seedSkillWithVerdict(world.sql, `@${world.testOrg}/unsafe-skill`, "1.0.0", "fail", { critical: 1, high: 0, medium: 0, low: 0 });
    await seedSkillWithVerdict(world.sql, `@${world.testOrg}/pending-skill`, "1.0.0", null, { critical: 0, high: 0, medium: 0, low: 0 });
    await seedSkillWithVerdict(world.sql, `@${world.testOrg}/badge-skill`, "1.0.0", "pass", { critical: 0, high: 0, medium: 0, low: 0 });
  }, 60_000);

  afterAll(async () => {
    if (world.sql) {
      await cleanupTrustBadgeData(world.sql);
      await world.sql.end();
    }
  }, 15_000);

  // ── Verified badge (C1) ─────────────────────────────────────────────

  describe("Scenario: Skill with PASS verdict and 0 findings shows verified badge", () => {
    it.skipIf(!hasDatabase || !hasRegistry)("shows green Verified badge", async () => {
      const { html } = await fetchSkillPage(`@${world.testOrg}/verified-skill`);
      world.lastHtml = html;
      // Check for verified badge text and green styling
      expect(html).toContain("Verified");
      expect(html.toLowerCase()).toMatch(/green|bg-green|text-green/);
    });
  });

  // ── Review Recommended badge ───────────────────────────────────────

  describe("Scenario: Skill with PASS_WITH_NOTES shows review recommended badge", () => {
    it.skipIf(!hasDatabase || !hasRegistry)("shows yellow Review Recommended badge", async () => {
      const { html } = await fetchSkillPage(`@${world.testOrg}/review-skill`);
      expect(html).toContain("Review Recommended");
      expect(html.toLowerCase()).toMatch(/yellow|bg-yellow|text-yellow/);
    });
  });

  // ── Concerns badge ──────────────────────────────────────────────────

  describe("Scenario: Skill with FLAGGED verdict shows concerns badge", () => {
    it.skipIf(!hasDatabase || !hasRegistry)("shows orange Concerns badge", async () => {
      const { html } = await fetchSkillPage(`@${world.testOrg}/flagged-skill`);
      expect(html).toContain("Concerns");
      expect(html.toLowerCase()).toMatch(/orange|bg-orange|text-orange/);
    });
  });

  // ── Unsafe badge ─────────────────────────────────────────────────────

  describe("Scenario: Skill with FAIL verdict shows unsafe badge", () => {
    it.skipIf(!hasDatabase || !hasRegistry)("shows red Unsafe badge", async () => {
      const { html } = await fetchSkillPage(`@${world.testOrg}/unsafe-skill`);
      expect(html).toContain("Unsafe");
      expect(html.toLowerCase()).toMatch(/red|bg-red|text-red/);
    });
  });

  // ── Pending badge (C1) ───────────────────────────────────────────────

  describe("Scenario: Skill not yet scanned shows pending badge", () => {
    it.skipIf(!hasDatabase || !hasRegistry)("shows gray Pending badge", async () => {
      const { html } = await fetchSkillPage(`@${world.testOrg}/pending-skill`);
      expect(html).toContain("Pending");
      expect(html.toLowerCase()).toMatch(/gray|bg-gray|text-gray/);
    });
  });

  // ── Badge API (C2) ─────────────────────────────────────────────────────

  describe("Scenario: Badge API returns trust level SVG", () => {
    it.skipIf(!hasDatabase || !hasRegistry)("returns 200", async () => {
      const { status, body } = await fetchBadge(`@${world.testOrg}/badge-skill`);
      world.lastStatus = status;
      world.lastBody = body;
      expect(status).toBe(200);
    });

    it.skipIf(!hasDatabase || !hasRegistry)("SVG contains verified", () => {
      expect(world.lastBody.toLowerCase()).toContain("verified");
    });
  });
});
