/**
 * BDD step definitions for admin package catalog management.
 *
 * Intent: .idd/modules/admin-packages/INTENT.md
 * Feature: .bdd/features/admin-packages/packages.feature
 *
 * Runs against REAL PostgreSQL + REAL registry HTTP — zero mocks.
 * Uses createAdminSession/cleanupAdminSession to provision real admin credentials.
 */
import { randomUUID } from "node:crypto";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import postgres from "postgres";

const hasDatabase = !!process.env.DATABASE_URL;
const hasRegistry = !!process.env.REGISTRY_URL;
import {
  createAdminApiClient,
  createAdminSession,
  cleanupAdminSession,
  type AdminApiClient,
} from "../interactions/admin-api-client.js";

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
  registry: process.env.REGISTRY_URL ?? "http://localhost:3003",
  sql: null,
  runId: "",
  client: null,
  testSkillId: "",
  testSkillName: "",
};

// ── Helpers ────────────────────────────────────────────────────────────────

async function adminGet(path: string, cookieHeader?: string): Promise<{ status: number; body: unknown }> {
  const headers: Record<string, string> = {};
  if (cookieHeader) headers["Cookie"] = cookieHeader;
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

async function givenTestSkillExists(name: string): Promise<void> {
  const sql = world.sql!;
  const now = new Date();
  const publisherId = `pkg-pub-${world.runId}`;
  const skillId = randomUUID();

  await sql`
    INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
    VALUES (${publisherId}, ${"BDD Pkg Publisher"}, ${`pkg-pub-${world.runId}@tank.test`}, true, ${now}, ${now})
    ON CONFLICT (id) DO NOTHING
  `;

  await sql`
    INSERT INTO skills (id, name, description, publisher_id, status, visibility, created_at, updated_at)
    VALUES (${skillId}, ${name}, ${"BDD admin packages test"}, ${publisherId}, ${"active"}, ${"public"}, ${now}, ${now})
    ON CONFLICT (name) DO UPDATE SET updated_at = ${now}
  `;

  const [existing] = await sql`SELECT id FROM skills WHERE name = ${name} LIMIT 1`;
  world.testSkillId = (existing?.id as string) ?? skillId;
  world.testSkillName = name;
}

// ── Feature ────────────────────────────────────────────────────────────────

describe("Feature: Admin package catalog management", () => {
  beforeAll(async () => {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL is required");
    world.sql = postgres(connectionString);
    world.runId = randomUUID().replace(/-/g, "").slice(0, 10);
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
    } catch (e) {
      console.warn("admin-packages cleanup warning:", e);
    } finally {
      await sql.end();
    }
  }, 15_000);

  // ── Auth enforcement (C1) ─────────────────────────────────────────

  describe("Scenario: GET /admin/packages as non-admin returns 401", () => {
    it.skipIf(!hasDatabase || !hasRegistry)("runs Given/When/Then", async () => {
      const { status } = await adminGet("/api/admin/packages");
      expect(status).toBe(401);
    });
  });

  // ── List packages (C2, C4) ────────────────────────────────────────

  describe("Scenario: GET /admin/packages returns paginated package list with publisher info (E1)", () => {
    it.skipIf(!hasDatabase || !hasRegistry)("runs Given/When/Then", async () => {
      const { status, body } = await adminGet("/api/admin/packages", world.client!.session!.cookieHeader);
      expect(status).toBe(200);
      const b = body as Record<string, unknown>;
      expect(b).toHaveProperty("packages");
      expect(b).toHaveProperty("total");
      const packages = b["packages"] as Array<Record<string, unknown>>;
      expect(Array.isArray(packages)).toBe(true);
      for (const pkg of packages.slice(0, 3)) {
        expect(pkg).toHaveProperty("publisher");
        const publisher = pkg["publisher"] as Record<string, unknown>;
        expect(publisher).toHaveProperty("name");
        expect(publisher).toHaveProperty("email");
      }
    });
  });

  // ── Search filter (C2) ────────────────────────────────────────────

  describe("Scenario: Search by name filters results (E4)", () => {
    it.skipIf(!hasDatabase || !hasRegistry)("runs Given/When/Then", async () => {
      const { status, body } = await adminGet(
        `/api/admin/packages?search=admin-pkg-search-target`,
        world.client!.session!.cookieHeader,
      );
      expect(status).toBe(200);
      const packages = (body as Record<string, unknown>)["packages"] as Array<Record<string, unknown>>;
      expect(Array.isArray(packages)).toBe(true);
      const found = packages.some((p) => (p["name"] as string).includes("admin-pkg-search-target"));
      expect(found).toBe(true);
    });
  });

  // ── Status filter validation (C3) ────────────────────────────────

  describe("Scenario: Invalid status filter returns 400 (E3)", () => {
    it.skipIf(!hasDatabase || !hasRegistry)("runs Given/When/Then", async () => {
      const { status, body } = await adminGet(
        "/api/admin/packages?status=invalid-status",
        world.client!.session!.cookieHeader,
      );
      expect(status).toBe(400);
      const bodyStr = JSON.stringify(body).toLowerCase();
      expect(bodyStr).toMatch(/active|deprecated|quarantined|removed/);
    });
  });

  // ── Featured filter (C2) ─────────────────────────────────────────

  describe("Scenario: Filter by featured=true returns only featured packages", () => {
    it.skipIf(!hasDatabase || !hasRegistry)("runs Given/When/Then", async () => {
      const { status, body } = await adminGet("/api/admin/packages?featured=true", world.client!.session!.cookieHeader);
      expect(status).toBe(200);
      const packages = (body as Record<string, unknown>)["packages"] as Array<Record<string, unknown>>;
      expect(Array.isArray(packages)).toBe(true);
      for (const pkg of packages) {
        expect(pkg["featured"]).toBe(true);
      }
    });
  });
});
