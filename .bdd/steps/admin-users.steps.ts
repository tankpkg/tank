/**
 * BDD step definitions for admin user management.
 *
 * Intent: .idd/modules/admin-users/INTENT.md
 * Feature: .bdd/features/admin-users/users.feature
 *
 * Runs against REAL PostgreSQL + REAL registry HTTP — zero mocks.
 * Uses createAdminSession/cleanupAdminSession to provision real admin credentials.
 */
import { randomUUID } from "node:crypto";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import postgres from "postgres";

const hasDatabase = !!process.env.DATABASE_URL;
const hasRegistry = !!process.env.E2E_REGISTRY_URL;
import {
  createAdminApiClient,
  createAdminSession,
  cleanupAdminSession,
  type AdminApiClient,
} from "../interactions/admin-api-client.js";

// ── World ──────────────────────────────────────────────────────────────────

interface AdminUsersWorld {
  registry: string;
  sql: postgres.Sql | null;
  runId: string;
  client: AdminApiClient | null;
}

const world: AdminUsersWorld = {
  registry: process.env.E2E_REGISTRY_URL ?? "http://localhost:3003",
  sql: null,
  runId: "",
  client: null,
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

async function givenIAmAuthenticatedAsAdmin(): Promise<void> {
  await createAdminSession(world.client!, world.runId);
}

async function givenTestUserExists(email: string): Promise<void> {
  const sql = world.sql!;
  const userId = `reg-filter-${world.runId}`;
  const now = new Date();
  await sql`
    INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
    VALUES (${userId}, ${"BDD Filter User"}, ${email}, true, ${now}, ${now})
    ON CONFLICT (email) DO NOTHING
  `;
}

async function givenSuspendedUserExists(): Promise<void> {
  const sql = world.sql!;
  const userId = `reg-suspended-${world.runId}`;
  const now = new Date();
  await sql`
    INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
    VALUES (${userId}, ${"BDD Suspended User"}, ${`suspended-${world.runId}@tank.test`}, true, ${now}, ${now})
    ON CONFLICT (id) DO NOTHING
  `;
  await sql`
    INSERT INTO user_status (id, user_id, status, reason, created_at)
    VALUES (${`status-${world.runId}`}, ${userId}, ${"suspended"}, ${"BDD test"}, ${now})
    ON CONFLICT DO NOTHING
  `;
}

// ── Then ───────────────────────────────────────────────────────────────────

function expectStatus(actual: number, expected: number): void {
  expect(actual).toBe(expected);
}

function expectBodyContains(body: unknown, ...fields: string[]): void {
  const b = body as Record<string, unknown>;
  for (const f of fields) {
    expect(b).toHaveProperty(f);
  }
}

// ── Feature ────────────────────────────────────────────────────────────────

describe("Feature: Admin user management", () => {
  beforeAll(async () => {
    if (!hasDatabase || !hasRegistry) return;
    const connectionString = process.env.DATABASE_URL!;
    world.sql = postgres(connectionString);
    world.runId = randomUUID().replace(/-/g, "").slice(0, 10);
    world.client = createAdminApiClient(world.registry, world.sql);
    await givenIAmAuthenticatedAsAdmin();
  }, 30_000);

  afterAll(async () => {
    const sql = world.sql;
    if (!sql) return;
    try {
      if (world.client) await cleanupAdminSession(world.client, world.runId);
      const filterUserId = `reg-filter-${world.runId}`;
      const suspendedUserId = `reg-suspended-${world.runId}`;
      await sql`DELETE FROM user_status WHERE user_id = ${suspendedUserId}`;
      await sql`DELETE FROM "user" WHERE id IN (${filterUserId}, ${suspendedUserId})`;
    } catch (e) {
      console.warn("admin-users cleanup warning:", e);
    } finally {
      await sql.end();
    }
  }, 15_000);

  // ── Auth enforcement (C1) ─────────────────────────────────────────

  describe("Scenario: GET /admin/users as non-admin returns 401 (E2)", () => {
    it.skipIf(!hasDatabase || !hasRegistry)("runs Given/When/Then", async () => {
      const { status } = await adminGet("/api/admin/users");
      expectStatus(status, 401);
    });
  });

  // ── List users (C2, C5) ───────────────────────────────────────────

  describe("Scenario: GET /admin/users returns paginated user list (E1)", () => {
    it.skipIf(!hasDatabase || !hasRegistry)("runs Given/When/Then", async () => {
      const { status, body } = await adminGet("/api/admin/users", world.client!.session!.cookieHeader);
      expectStatus(status, 200);
      expectBodyContains(body, "users", "total", "totalPages");
    });
  });

  // ── Search filter (C3) ────────────────────────────────────────────

  describe("Scenario: Search by partial email filters results (E3)", () => {
    it.skipIf(!hasDatabase || !hasRegistry)("runs Given/When/Then", async () => {
      const email = `bdd-user-filter-test-${world.runId}@tank.test`;
      await givenTestUserExists(email);
      const { status, body } = await adminGet(
        `/api/admin/users?search=bdd-user-filter-test-${world.runId}`,
        world.client!.session!.cookieHeader,
      );
      expectStatus(status, 200);
      const users = (body as Record<string, unknown>)["users"] as Array<Record<string, unknown>>;
      expect(Array.isArray(users)).toBe(true);
      const found = users.some((u) => (u["email"] as string).includes(`bdd-user-filter-test-${world.runId}`));
      expect(found).toBe(true);
    });
  });

  // ── Role filter (C2) ─────────────────────────────────────────────

  describe("Scenario: Filter by role=admin returns only admin users (E4)", () => {
    it.skipIf(!hasDatabase || !hasRegistry)("runs Given/When/Then", async () => {
      const { status, body } = await adminGet("/api/admin/users?role=admin", world.client!.session!.cookieHeader);
      expectStatus(status, 200);
      const users = (body as Record<string, unknown>)["users"] as Array<Record<string, unknown>>;
      expect(Array.isArray(users)).toBe(true);
      for (const u of users) {
        expect(u["role"]).toBe("admin");
      }
    });
  });

  // ── Status filter (C4) ────────────────────────────────────────────

  describe("Scenario: Filter by status=suspended returns only suspended users (E5)", () => {
    it.skipIf(!hasDatabase || !hasRegistry)("runs Given/When/Then", async () => {
      await givenSuspendedUserExists();
      const { status, body } = await adminGet("/api/admin/users?status=suspended", world.client!.session!.cookieHeader);
      expectStatus(status, 200);
      const users = (body as Record<string, unknown>)["users"] as Array<Record<string, unknown>>;
      expect(Array.isArray(users)).toBe(true);
      for (const u of users) {
        const latestStatus = u["latestStatus"] as Record<string, unknown> | null;
        if (latestStatus !== null) {
          expect(latestStatus["status"]).toBe("suspended");
        }
      }
    });
  });
});
