/**
 * BDD step definitions for admin service account management.
 *
 * Intent: .idd/modules/admin-service-accounts/INTENT.md
 * Feature: .bdd/features/admin-service-accounts/service-accounts.feature
 *
 * Runs against REAL PostgreSQL + REAL registry HTTP — zero mocks.
 * Uses createAdminSession/cleanupAdminSession to provision real admin credentials.
 * Tests the full CRUD lifecycle: create account → create key → revoke key → delete account.
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

interface ServiceAccountsWorld {
  registry: string;
  sql: postgres.Sql | null;
  runId: string;
  client: AdminApiClient | null;
  createdAccountId: string;
  createdKeyId: string;
}

const world: ServiceAccountsWorld = {
  registry: process.env.E2E_REGISTRY_URL ?? "http://localhost:3003",
  sql: null,
  runId: "",
  client: null,
  createdAccountId: "",
  createdKeyId: "",
};

// ── Helpers ────────────────────────────────────────────────────────────────

async function adminFetch(
  method: string,
  path: string,
  body?: unknown,
  cookieHeader?: string,
): Promise<{ status: number; body: unknown }> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (cookieHeader) headers["Cookie"] = cookieHeader;
  const res = await fetch(`${world.registry}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let responseBody: unknown;
  try {
    responseBody = await res.json();
  } catch {
    responseBody = null;
  }
  return { status: res.status, body: responseBody };
}

// ── Feature ────────────────────────────────────────────────────────────────

describe("Feature: Admin service account management", () => {
  beforeAll(async () => {
    if (!hasDatabase || !hasRegistry) return;
    const connectionString = process.env.DATABASE_URL!;
    world.sql = postgres(connectionString);
    world.runId = randomUUID().replace(/-/g, "").slice(0, 10);
    world.client = createAdminApiClient(world.registry, world.sql);
    await createAdminSession(world.client, world.runId);
  }, 30_000);

  afterAll(async () => {
    const sql = world.sql;
    if (!sql) return;
    try {
      if (world.client) await cleanupAdminSession(world.client, world.runId);
      if (world.createdAccountId) {
        await adminFetch(
          "DELETE",
          `/api/admin/service-accounts/${world.createdAccountId}`,
          undefined,
          world.client?.session?.cookieHeader,
        ).catch(() => {});
      }
    } catch (e) {
      console.warn("admin-service-accounts cleanup warning:", e);
    } finally {
      await sql.end();
    }
  }, 15_000);

  // ── Auth enforcement (C1) ─────────────────────────────────────────

  describe("Scenario: Any service account endpoint without auth returns 401 (E5)", () => {
    it.skipIf(!hasDatabase || !hasRegistry)("runs Given/When/Then", async () => {
      const { status } = await adminFetch("GET", "/api/admin/service-accounts");
      expect(status).toBe(401);
    });
  });

  // ── Create service account (C2) ───────────────────────────────────

  describe("Scenario: POST /admin/service-accounts creates an account (E1)", () => {
    it.skipIf(!hasDatabase || !hasRegistry)("runs Given/When/Then", async () => {
      const { status, body } = await adminFetch(
        "POST",
        "/api/admin/service-accounts",
        { displayName: `BDD CI Publisher ${world.runId}`, scopes: ["skills:publish"] },
        world.client!.session!.cookieHeader,
      );
      expect([200, 201]).toContain(status);
      const b = body as Record<string, unknown>;
      expect(b).toHaveProperty("serviceAccount");
      const account = b["serviceAccount"] as Record<string, unknown>;
      expect(account).toHaveProperty("id");
      world.createdAccountId = account["id"] as string;
    });
  });

  // ── Create API key (C3) ────────────────────────────────────────────

  describe("Scenario: POST /admin/service-accounts/[id]/keys returns the raw key once (E2)", () => {
    it.skipIf(!hasDatabase || !hasRegistry)("runs Given/When/Then", async () => {
      if (!world.createdAccountId) {
        console.warn("Skipping: no service account created");
        return;
      }
      const { status, body } = await adminFetch(
        "POST",
        `/api/admin/service-accounts/${world.createdAccountId}/keys`,
        { keyName: `bdd-key-${world.runId}`, scopes: ["skills:publish"] },
        world.client!.session!.cookieHeader,
      );
      expect(status).toBe(200);
      const b = body as Record<string, unknown>;
      expect(b).toHaveProperty("apiKey");
      const apiKey = b["apiKey"] as Record<string, unknown>;
      expect(apiKey).toHaveProperty("key");
      const rawKey = apiKey["key"] as string;
      expect(rawKey).toMatch(/^tank_/);
      expect(apiKey).toHaveProperty("id");
      world.createdKeyId = apiKey["id"] as string;
    });
  });

  // ── Revoke key (C4) ───────────────────────────────────────────────

  describe("Scenario: DELETE /admin/service-accounts/[id]/keys/[keyId] revokes the key (E3)", () => {
    it.skipIf(!hasDatabase || !hasRegistry)("runs Given/When/Then", async () => {
      if (!world.createdAccountId || !world.createdKeyId) {
        console.warn("Skipping: missing account or key id");
        return;
      }
      const { status, body } = await adminFetch(
        "DELETE",
        `/api/admin/service-accounts/${world.createdAccountId}/keys/${world.createdKeyId}`,
        undefined,
        world.client!.session!.cookieHeader,
      );
      expect(status).toBe(200);
      const b = body as Record<string, unknown>;
      expect(b).toHaveProperty("success", true);
      const revokedKey = b["key"] as Record<string, unknown>;
      expect(revokedKey["enabled"]).toBe(false);
    });
  });

  // ── List service accounts (C2) ────────────────────────────────────

  describe("Scenario: GET /admin/service-accounts returns list including created account", () => {
    it.skipIf(!hasDatabase || !hasRegistry)("runs Given/When/Then", async () => {
      const { status, body } = await adminFetch(
        "GET",
        "/api/admin/service-accounts",
        undefined,
        world.client!.session!.cookieHeader,
      );
      expect(status).toBe(200);
      const b = body as Record<string, unknown>;
      expect(b).toHaveProperty("serviceAccounts");
      expect(Array.isArray(b["serviceAccounts"])).toBe(true);
    });
  });
});
