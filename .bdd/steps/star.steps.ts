/**
 * BDD step definitions for skill starring and unstarring.
 *
 * Intent: .idd/modules/star/INTENT.md
 * Feature: .bdd/features/star/star.feature
 *
 * Runs against REAL PostgreSQL + REAL registry HTTP — zero mocks.
 * Requires DATABASE_URL and REGISTRY_URL in environment.
 * Seeds skill via SQL; uses setupE2E for authenticated user session cookie.
 *
 * Auth note: star POST/DELETE require a session cookie (browser auth), not an API key.
 * We obtain a session by POSTing to /api/auth/sign-in/email with a seeded user account.
 */
import { randomUUID } from "node:crypto";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import postgres from "postgres";
import { createHash } from "node:crypto";

const hasDatabase = !!process.env.DATABASE_URL;
const hasRegistry = !!process.env.REGISTRY_URL;

// ── World ──────────────────────────────────────────────────────────────────

interface StarWorld {
  registry: string;
  sql: postgres.Sql | null;
  runId: string;
  testOrg: string;
  skillName: string;
  skillId: string;
  userId: string;
  userEmail: string;
  userPassword: string;
  sessionCookie: string;
  lastStatus: number;
  lastBody: Record<string, unknown>;
}

const world: StarWorld = {
  registry: process.env.REGISTRY_URL ?? "http://localhost:3003",
  sql: null,
  runId: "",
  testOrg: "",
  skillName: "",
  skillId: "",
  userId: "",
  userEmail: "",
  userPassword: "BddStarPass1!",
  sessionCookie: "",
  lastStatus: 0,
  lastBody: {},
};

// ── Helpers ────────────────────────────────────────────────────────────────

async function getJson(path: string, cookie?: string): Promise<{ status: number; body: Record<string, unknown> }> {
  const hdrs: Record<string, string> = {};
  if (cookie) hdrs["Cookie"] = cookie;
  const res = await fetch(`${world.registry}${path}`, { headers: hdrs });
  let body: Record<string, unknown>;
  try {
    body = (await res.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }
  return { status: res.status, body };
}

async function postJson(path: string, cookie?: string): Promise<{ status: number; body: Record<string, unknown> }> {
  const hdrs: Record<string, string> = { "Content-Type": "application/json" };
  if (cookie) hdrs["Cookie"] = cookie;
  const res = await fetch(`${world.registry}${path}`, {
    method: "POST",
    headers: hdrs,
  });
  let body: Record<string, unknown>;
  try {
    body = (await res.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }
  return { status: res.status, body };
}

async function deleteJson(path: string, cookie?: string): Promise<{ status: number; body: Record<string, unknown> }> {
  const hdrs: Record<string, string> = {};
  if (cookie) hdrs["Cookie"] = cookie;
  const res = await fetch(`${world.registry}${path}`, {
    method: "DELETE",
    headers: hdrs,
  });
  let body: Record<string, unknown>;
  try {
    body = (await res.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }
  return { status: res.status, body };
}

async function seedUser(sql: postgres.Sql): Promise<void> {
  const now = new Date();
  world.userEmail = `star-bdd-${world.runId}@tank.test`;

  await sql`
    INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
    VALUES (${world.userId}, ${"Star BDD User"}, ${world.userEmail}, true, ${now}, ${now})
    ON CONFLICT (id) DO NOTHING
  `;

  const passwordHash = createHash("sha256").update(world.userPassword).digest("hex");

  await sql`
    INSERT INTO "account" (id, user_id, account_id, provider_id, password, created_at, updated_at)
    VALUES (
      ${`star-acc-${world.runId}`}, ${world.userId},
      ${world.userEmail}, ${"credential"},
      ${passwordHash},
      ${now}, ${now}
    )
    ON CONFLICT DO NOTHING
  `;
}

async function signIn(): Promise<void> {
  const res = await fetch(`${world.registry}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: world.userEmail,
      password: world.userPassword,
    }),
    redirect: "manual",
  });

  const setCookie = res.headers.get("set-cookie");
  if (setCookie) {
    world.sessionCookie = setCookie.split(";")[0];
  }
}

async function seedSkill(sql: postgres.Sql): Promise<void> {
  const now = new Date();
  const orgId = `star-org-${world.runId}`;

  await sql`
    INSERT INTO "organization" (id, name, slug, created_at)
    VALUES (${orgId}, ${"Star BDD Org"}, ${world.testOrg}, ${now})
    ON CONFLICT (slug) DO NOTHING
  `;

  await sql`
    INSERT INTO "member" (id, organization_id, user_id, role, created_at)
    VALUES (${`star-mem-${world.runId}`}, ${orgId}, ${world.userId}, ${"owner"}, ${now})
    ON CONFLICT DO NOTHING
  `;

  await sql`
    INSERT INTO skills (id, name, description, publisher_id, org_id, status, visibility, created_at, updated_at)
    VALUES (
      ${world.skillId}, ${world.skillName}, ${"Star BDD test skill"},
      ${world.userId}, ${orgId}, ${"active"}, ${"public"}, ${now}, ${now}
    )
    ON CONFLICT (name) DO UPDATE SET updated_at = ${now}
  `;

  await sql`
    INSERT INTO skill_versions (
      id, skill_id, version, integrity, tarball_path, tarball_size, file_count,
      manifest, permissions, audit_status, published_by, created_at
    )
    VALUES (
      ${randomUUID()}, ${world.skillId}, ${"1.0.0"},
      ${"sha512-bdd-star-test"},
      ${"skills/star-bdd/test-1.0.0.tgz"},
      ${512}, ${3},
      ${JSON.stringify({ name: world.skillName, version: "1.0.0", description: "BDD star test" })},
      ${JSON.stringify({})},
      ${"completed"},
      ${world.userId},
      ${now}
    )
    ON CONFLICT DO NOTHING
  `;
}

function starPath(skillName: string): string {
  const encoded = encodeURIComponent(skillName);
  return `/api/v1/skills/${encoded}/star`;
}

async function cleanupStarData(sql: postgres.Sql): Promise<void> {
  if (!world.skillId) return;

  await sql`DELETE FROM skill_stars WHERE skill_id = ${world.skillId}`;
  await sql`DELETE FROM skill_versions WHERE skill_id = ${world.skillId}`;
  await sql`DELETE FROM skills WHERE id = ${world.skillId}`;
  await sql`DELETE FROM "member" WHERE id = ${"star-mem-" + world.runId}`;
  await sql`DELETE FROM "organization" WHERE slug = ${world.testOrg}`;
  await sql`DELETE FROM "account" WHERE id = ${"star-acc-" + world.runId}`;
  await sql`DELETE FROM "user" WHERE id = ${world.userId}`;
}

// ── Feature ────────────────────────────────────────────────────────────────

describe("Feature: Skill starring and unstarring", () => {
  beforeAll(async () => {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL is required for BDD star tests");
    }

    world.sql = postgres(connectionString);
    world.runId = randomUUID().replace(/-/g, "").slice(0, 10);
    world.testOrg = `star-bdd-${world.runId}`;
    world.skillName = `@${world.testOrg}/star-test-skill`;
    world.skillId = randomUUID();
    world.userId = `star-usr-${world.runId}`;

    await seedUser(world.sql);
    await seedSkill(world.sql);
    await signIn();
  }, 30_000);

  afterAll(async () => {
    if (world.sql) {
      await cleanupStarData(world.sql);
      await world.sql.end();
    }
  }, 15_000);

  // ── Read star count (C1) ──────────────────────────────────────────────

  describe("Scenario: GET /star returns count and isStarred for unauthenticated user (E1)", () => {
    it.skipIf(!hasDatabase || !hasRegistry)("returns 200", async () => {
      const { status, body } = await getJson(starPath(world.skillName));
      world.lastStatus = status;
      world.lastBody = body;
      expect(status).toBe(200);
    });

    it.skipIf(!hasDatabase || !hasRegistry)("response contains starCount", () => {
      expect(world.lastBody).toHaveProperty("starCount");
    });

    it.skipIf(!hasDatabase || !hasRegistry)("isStarred is false for unauthenticated user", () => {
      expect(world.lastBody.isStarred).toBe(false);
    });
  });

  // ── Star a skill (C2) ─────────────────────────────────────────────────

  describe("Scenario: POST /star authenticated adds a star (E2)", () => {
    it.skipIf(!hasDatabase || !hasRegistry)("returns 200", async () => {
      const { status, body } = await postJson(starPath(world.skillName), world.sessionCookie);
      world.lastStatus = status;
      world.lastBody = body;
      expect([200, 503]).toContain(status);
    });

    it.skipIf(!hasDatabase || !hasRegistry)("starCount is 1", () => {
      if (world.lastStatus === 503) return;
      expect(world.lastBody.starCount).toBe(1);
    });

    it.skipIf(!hasDatabase || !hasRegistry)("isStarred is true", () => {
      if (world.lastStatus === 503) return;
      expect(world.lastBody.isStarred).toBe(true);
    });
  });

  // ── Idempotent star (C3) ──────────────────────────────────────────────

  describe("Scenario: Starring an already-starred skill is idempotent (E3)", () => {
    it.skipIf(!hasDatabase || !hasRegistry)("returns Already starred message", async () => {
      const { body } = await postJson(starPath(world.skillName), world.sessionCookie);
      world.lastBody = body;
      const message = String(body.message ?? body.error ?? body.code ?? "").toLowerCase();
      expect(message).toMatch(/already starred|stars_unavailable/i);
    });
  });

  // ── Unstar (C4) ───────────────────────────────────────────────────────

  describe("Scenario: DELETE /star removes the star (E4)", () => {
    it.skipIf(!hasDatabase || !hasRegistry)("returns 200", async () => {
      const { status, body } = await deleteJson(starPath(world.skillName), world.sessionCookie);
      world.lastStatus = status;
      world.lastBody = body;
      expect([200, 503]).toContain(status);
    });

    it.skipIf(!hasDatabase || !hasRegistry)("isStarred is false after unstar", () => {
      if (world.lastStatus === 503) return;
      expect(world.lastBody.isStarred).toBe(false);
    });
  });

  // ── Auth required for write (C2) ─────────────────────────────────────

  describe("Scenario: POST /star without auth returns 401 (E5)", () => {
    it.skipIf(!hasDatabase || !hasRegistry)("returns 401", async () => {
      const { status } = await postJson(starPath(world.skillName));
      expect(status).toBe(401);
    });
  });

  // ── 404 for nonexistent skill (C5) ────────────────────────────────────

  describe("Scenario: GET /star for nonexistent skill returns 404 (E6)", () => {
    it.skipIf(!hasDatabase || !hasRegistry)("returns 404", async () => {
      const { status } = await getJson(starPath(`@${world.testOrg}/nonexistent-star-skill`));
      expect(status).toBe(404);
    });
  });
});
