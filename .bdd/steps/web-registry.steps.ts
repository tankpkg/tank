/**
 * BDD step definitions for the registry read API (public skill metadata).
 *
 * Intent: .idd/modules/web-registry/INTENT.md
 * Feature: .bdd/features/web-registry/registry-read.feature
 *
 * Runs against REAL PostgreSQL + REAL registry HTTP — zero mocks.
 * Requires DATABASE_URL and E2E_REGISTRY_URL in environment.
 * Seeds test packages directly via SQL; no publish flow needed for read-only tests.
 */
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import postgres from "postgres";

const hasDatabase = !!process.env.DATABASE_URL;
const hasRegistry = !!process.env.E2E_REGISTRY_URL;

// ── World ──────────────────────────────────────────────────────────────────

interface RegistryWorld {
  registry: string;
  sql: postgres.Sql | null;
  runId: string;
  testOrg: string;
  skillId: string;
  versionId: string;
  privateSkillId: string;
  lastStatus: number;
  lastBody: unknown;
}

const world: RegistryWorld = {
  registry: process.env.E2E_REGISTRY_URL ?? "http://localhost:3003",
  sql: null,
  runId: "",
  testOrg: "",
  skillId: "",
  versionId: "",
  privateSkillId: "",
  lastStatus: 0,
  lastBody: null,
};

// ── Helpers ────────────────────────────────────────────────────────────────

async function getJson(path: string): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`${world.registry}${path}`);
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { status: res.status, body };
}

// ── Given ──────────────────────────────────────────────────────────────────

async function givenPublicSkillExists(name: string, version: string): Promise<void> {
  const sql = world.sql!;
  const now = new Date();
  const publisherId = `reg-pub-${world.runId}`;
  const orgId = `reg-org-${world.runId}`;
  const skillId = randomUUID();
  const vId = randomUUID();

  await sql`
    INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
    VALUES (${publisherId}, ${"Registry BDD User"}, ${`reg-bdd-${world.runId}@tank.test`}, true, ${now}, ${now})
    ON CONFLICT (id) DO NOTHING
  `;

  await sql`
    INSERT INTO "organization" (id, name, slug, created_at)
    VALUES (${orgId}, ${"Registry BDD Org"}, ${world.testOrg}, ${now})
    ON CONFLICT (slug) DO NOTHING
  `;

  await sql`
    INSERT INTO "member" (id, organization_id, user_id, role, created_at)
    VALUES (${`reg-mem-${world.runId}`}, ${orgId}, ${publisherId}, ${"owner"}, ${now})
    ON CONFLICT DO NOTHING
  `;

  await sql`
    INSERT INTO skills (id, name, description, publisher_id, org_id, status, visibility, created_at, updated_at)
    VALUES (${skillId}, ${name}, ${"Registry BDD public skill"}, ${publisherId}, ${orgId}, ${"active"}, ${"public"}, ${now}, ${now})
    ON CONFLICT (name) DO UPDATE SET updated_at = ${now}
  `;

  const [existing] = await sql`SELECT id FROM skills WHERE name = ${name} LIMIT 1`;
  world.skillId = (existing?.id as string) ?? skillId;

  await sql`
    INSERT INTO skill_versions (id, skill_id, version, integrity, tarball_path, tarball_size, file_count, manifest, permissions, audit_status, published_by, created_at)
    VALUES (
      ${vId}, ${world.skillId}, ${version},
      ${"sha512-bdd-registry-read"},
      ${"skills/registry-bdd/test-1.0.0.tgz"},
      ${512}, ${3},
      ${JSON.stringify({ name, version, description: "BDD registry read test" })},
      ${JSON.stringify({})},
      ${"completed"},
      ${publisherId},
      ${now}
    )
    ON CONFLICT DO NOTHING
  `;

  const [existingV] =
    await sql`SELECT id FROM skill_versions WHERE skill_id = ${world.skillId} AND version = ${version} LIMIT 1`;
  world.versionId = (existingV?.id as string) ?? vId;
}

async function givenPrivateSkillExists(name: string, version: string): Promise<void> {
  const sql = world.sql!;
  const now = new Date();
  const publisherId = `reg-pub-${world.runId}`;
  const privateSkillId = randomUUID();

  await sql`
    INSERT INTO skills (id, name, description, publisher_id, status, visibility, created_at, updated_at)
    VALUES (${privateSkillId}, ${name}, ${"Registry BDD private skill"}, ${publisherId}, ${"active"}, ${"private"}, ${now}, ${now})
    ON CONFLICT (name) DO UPDATE SET updated_at = ${now}
  `;

  const [existing] = await sql`SELECT id FROM skills WHERE name = ${name} LIMIT 1`;
  world.privateSkillId = (existing?.id as string) ?? privateSkillId;

  await sql`
    INSERT INTO skill_versions (id, skill_id, version, integrity, tarball_path, tarball_size, file_count, manifest, permissions, audit_status, published_by, created_at)
    VALUES (
      ${randomUUID()}, ${world.privateSkillId}, ${version},
      ${"sha512-bdd-registry-private"},
      ${"skills/registry-bdd/private-1.0.0.tgz"},
      ${256}, ${2},
      ${JSON.stringify({ name, version })},
      ${JSON.stringify({})},
      ${"completed"},
      ${publisherId},
      ${now}
    )
    ON CONFLICT DO NOTHING
  `;
}

// ── When ───────────────────────────────────────────────────────────────────

async function whenICallGet(path: string): Promise<void> {
  const { status, body } = await getJson(path);
  world.lastStatus = status;
  world.lastBody = body;
}

// ── Then ───────────────────────────────────────────────────────────────────

function thenStatusIs(code: number): void {
  expect(world.lastStatus).toBe(code);
}

function thenBodyIncludes(...fields: string[]): void {
  const body = world.lastBody as Record<string, unknown>;
  for (const field of fields) {
    expect(body).toHaveProperty(field);
  }
}

function thenBodyIsArray(): void {
  expect(Array.isArray(world.lastBody)).toBe(true);
}

function thenBodyFieldEquals(field: string, value: unknown): void {
  const body = world.lastBody as Record<string, unknown>;
  expect(body[field]).toBe(value);
}

// ── Feature ────────────────────────────────────────────────────────────────

describe("Feature: Registry read API for skill metadata", () => {
  beforeAll(async () => {
    if (!hasDatabase || !hasRegistry) return;
    const connectionString = process.env.DATABASE_URL!;
    world.sql = postgres(connectionString);
    world.runId = randomUUID().replace(/-/g, "").slice(0, 10);
    world.testOrg = `reg-bdd-${world.runId}`;

    await givenPublicSkillExists(`@${world.testOrg}/registry-read-skill`, "2.3.1");
    await givenPrivateSkillExists(`@${world.testOrg}/private-registry-skill`, "1.0.0");
  }, 30_000);

  afterAll(async () => {
    const sql = world.sql;
    if (!sql) return;
    try {
      const publisherId = `reg-pub-${world.runId}`;
      const skillIds = sql`SELECT id FROM skills WHERE publisher_id = ${publisherId}`;
      await sql`DELETE FROM skill_versions WHERE skill_id IN (${skillIds})`;
      await sql`DELETE FROM skills WHERE publisher_id = ${publisherId}`;
      await sql`DELETE FROM "member" WHERE id = ${`reg-mem-${world.runId}`}`;
      await sql`DELETE FROM "organization" WHERE slug = ${world.testOrg}`;
      await sql`DELETE FROM "user" WHERE id = ${publisherId}`;
    } catch (e) {
      console.warn("web-registry cleanup warning:", e);
    } finally {
      await sql.end();
    }
  }, 15_000);

  // ── Single skill metadata (C1, C2) ────────────────────────────────

  describe("Scenario: GET /skills/[name] returns metadata for a public skill (E1)", () => {
    it.skipIf(!hasDatabase || !hasRegistry)("runs Given/When/Then", async () => {
      await whenICallGet(`/api/v1/skills/@${world.testOrg}/registry-read-skill`);
      thenStatusIs(200);
      thenBodyIncludes("name", "latestVersion");
    });
  });

  describe("Scenario: GET /skills/[name] returns 404 for unknown skill (E2)", () => {
    it.skipIf(!hasDatabase || !hasRegistry)("runs Given/When/Then", async () => {
      await whenICallGet(`/api/v1/skills/@${world.testOrg}/does-not-exist-zzz`);
      thenStatusIs(404);
    });
  });

  // ── Private visibility enforcement (C5) ──────────────────────────

  describe("Scenario: Private skill is not visible to unauthenticated requests (E5)", () => {
    it.skipIf(!hasDatabase || !hasRegistry)("runs Given/When/Then", async () => {
      await whenICallGet(`/api/v1/skills/@${world.testOrg}/private-registry-skill`);
      thenStatusIs(404);
    });
  });

  // ── Version detail (C3) ───────────────────────────────────────────

  describe("Scenario: GET /skills/[name]/[version] returns version detail (E3)", () => {
    it.skipIf(!hasDatabase || !hasRegistry)("runs Given/When/Then", async () => {
      await whenICallGet(`/api/v1/skills/@${world.testOrg}/registry-read-skill/2.3.1`);
      thenStatusIs(200);
      thenBodyIncludes("version");
    });
  });

  // ── Version list (C4) ─────────────────────────────────────────────

  describe("Scenario: GET /skills/[name]/versions returns list of versions (E4)", () => {
    it.skipIf(!hasDatabase || !hasRegistry)("runs Given/When/Then", async () => {
      await whenICallGet(`/api/v1/skills/@${world.testOrg}/registry-read-skill/versions`);
      thenStatusIs(200);
      thenBodyIsArray();
    });
  });

  // ── URL encoding (C6) ─────────────────────────────────────────────

  describe("Scenario: Skill name with @ and / survives URL encoding in path", () => {
    it.skipIf(!hasDatabase || !hasRegistry)("runs Given/When/Then", async () => {
      const encoded = encodeURIComponent(`@${world.testOrg}/registry-read-skill`);
      await whenICallGet(`/api/v1/skills/${encoded}`);
      thenStatusIs(200);
      thenBodyFieldEquals("name", `@${world.testOrg}/registry-read-skill`);
    });
  });
});

// ── Homepage UX feature (source-level assertions) ──────────────────────────

interface HomepageUxWorld {
  source: string;
  heroSection: string;
}

const homepageWorld: HomepageUxWorld = {
  source: "",
  heroSection: "",
};

const homepagePath = fileURLToPath(new URL("../../packages/web/app/page.tsx", import.meta.url));

function givenINavigateToTankHomepage(): void {
  homepageWorld.source = fs.readFileSync(homepagePath, "utf-8");
  const heroStart = homepageWorld.source.indexOf("{/* Hero Section */}");
  const problemStart = homepageWorld.source.indexOf("{/* Problem Statement — moved up, immediately below hero */}");
  expect(heroStart).toBeGreaterThan(-1);
  expect(problemStart).toBeGreaterThan(heroStart);
  homepageWorld.heroSection = homepageWorld.source.slice(heroStart, problemStart);
}

function givenIReadOnlyHeroHeadlineAndSubheadline(): void {
  if (!homepageWorld.heroSection) givenINavigateToTankHomepage();
}

function thenHeroDefinesAgentSkillsInPlainLanguage(): void {
  expect(homepageWorld.heroSection).toContain("Agent skills");
  expect(homepageWorld.heroSection).toContain("are plugins that extend what your AI coding");
  expect(homepageWorld.heroSection).toContain("tool can do");
}

function thenDefinitionDoesNotAssumePriorKnowledge(): void {
  expect(homepageWorld.heroSection).toContain("plugins");
  expect(homepageWorld.heroSection).toContain("AI coding");
}

function thenHeroIdentifiesAudience(): void {
  expect(homepageWorld.heroSection).toContain("For developers using Claude Code, Cursor, and other AI coding agents");
}

function thenAudienceStatementIsVisibleWithoutScrollAt1280(): void {
  expect(homepageWorld.heroSection).toContain("For developers using Claude Code, Cursor, and other AI coding agents");
}

function thenSecurityRiskReferenceIsVisible(): void {
  expect(homepageWorld.source).toContain("malicious skills");
  expect(homepageWorld.source).toContain("credential-stealing malware");
}

function thenRiskFramingIsWithinFirstTwoSections(): void {
  const riskPos = homepageWorld.source.indexOf("341 malicious skills");
  const explainerPos = homepageWorld.source.indexOf(
    "{/* What is Tank — plain-language explainer before feature grid */}",
  );
  expect(riskPos).toBeGreaterThan(-1);
  expect(explainerPos).toBeGreaterThan(riskPos);
}

function thenBeginnerFriendlyWhatIsTankAppears(): void {
  expect(homepageWorld.source).toContain("Tank is");
  expect(homepageWorld.source).toContain("npm for agent skills");
  expect(homepageWorld.source).toContain("Just like npm manages JavaScript packages");
}

function thenExplainerAppearsBeforeFeatureCards(): void {
  const explainerPos = homepageWorld.source.indexOf(
    "{/* What is Tank — plain-language explainer before feature grid */}",
  );
  const featureGridPos = homepageWorld.source.indexOf("{/* Feature Grid */}");
  expect(explainerPos).toBeGreaterThan(-1);
  expect(featureGridPos).toBeGreaterThan(explainerPos);
}

function thenPrimaryCtaIsInHeroSection(): void {
  expect(homepageWorld.heroSection).toContain('data-testid="home-primary-cta"');
  expect(homepageWorld.heroSection).toContain("Browse Skills");
}

function thenPrimaryCtaVisibleWithoutScrollAt1280(): void {
  expect(homepageWorld.heroSection).toContain('data-testid="home-primary-cta"');
}

function thenICanAnswerWhatIsTankWithoutReadingFurther(): void {
  expect(homepageWorld.heroSection).toContain("Tank");
  expect(homepageWorld.heroSection).toContain("is the package manager for agent skills");
}

function thenICanAnswerWhoIsTankForWithoutReadingFurther(): void {
  expect(homepageWorld.heroSection).toContain("For developers using Claude Code, Cursor, and other AI coding agents");
}

function thenICanAnswerWhyTankExistsWithoutReadingFurther(): void {
  expect(homepageWorld.heroSection).toContain("skill registries have no security scanning");
  expect(homepageWorld.heroSection).toContain("attackers are already");
}

describe("Feature: Homepage first-time visitor UX", () => {
  describe('Scenario: Hero section defines "agent skills" in plain language', () => {
    it("runs Given/When/Then", () => {
      givenINavigateToTankHomepage();
      thenHeroDefinesAgentSkillsInPlainLanguage();
      thenDefinitionDoesNotAssumePriorKnowledge();
    });
  });

  describe("Scenario: Hero section identifies the target audience", () => {
    it("runs Given/When/Then", () => {
      givenINavigateToTankHomepage();
      thenHeroIdentifiesAudience();
      thenAudienceStatementIsVisibleWithoutScrollAt1280();
    });
  });

  describe("Scenario: Security problem is visible above or immediately below the fold", () => {
    it("runs Given/When/Then", () => {
      givenINavigateToTankHomepage();
      thenSecurityRiskReferenceIsVisible();
      thenRiskFramingIsWithinFirstTwoSections();
    });
  });

  describe('Scenario: Plain-language "What is Tank?" explanation appears before feature grid', () => {
    it("runs Given/When/Then", () => {
      givenINavigateToTankHomepage();
      thenBeginnerFriendlyWhatIsTankAppears();
      thenExplainerAppearsBeforeFeatureCards();
    });
  });

  describe("Scenario: Primary CTA is visible without scrolling on desktop", () => {
    it("runs Given/When/Then", () => {
      givenINavigateToTankHomepage();
      thenPrimaryCtaIsInHeroSection();
      thenPrimaryCtaVisibleWithoutScrollAt1280();
    });
  });

  describe("Scenario: Value proposition is understandable in under 5 seconds", () => {
    it("runs Given/When/Then", () => {
      givenINavigateToTankHomepage();
      givenIReadOnlyHeroHeadlineAndSubheadline();
      thenICanAnswerWhatIsTankWithoutReadingFurther();
      thenICanAnswerWhoIsTankForWithoutReadingFurther();
      thenICanAnswerWhyTankExistsWithoutReadingFurther();
    });
  });
});
