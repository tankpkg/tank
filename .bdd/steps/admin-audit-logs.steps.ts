/**
 * BDD step definitions for admin audit log access.
 *
 * Intent: .idd/modules/admin-audit-logs/INTENT.md
 * Feature: .bdd/features/admin-audit-logs/audit-logs.feature
 *
 * Runs against REAL PostgreSQL + REAL registry HTTP — zero mocks.
 * Uses createAdminSession/cleanupAdminSession to provision real admin credentials.
 * Seeds an audit event for the admin user to test actorName/actorEmail join.
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

interface AuditLogsWorld {
  registry: string;
  sql: postgres.Sql | null;
  runId: string;
  client: AdminApiClient | null;
  seededEventId: string;
}

const world: AuditLogsWorld = {
  registry: process.env.E2E_REGISTRY_URL ?? "http://localhost:3003",
  sql: null,
  runId: "",
  client: null,
  seededEventId: "",
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

async function givenAuditEventExistsForAdmin(): Promise<void> {
  const sql = world.sql!;
  const eventId = randomUUID();
  const adminUserId = `e2e-admin-${world.runId}`;
  const now = new Date();
  await sql`
    INSERT INTO audit_events (id, action, actor_id, target_type, target_id, metadata, created_at)
    VALUES (${eventId}, ${"bdd.test.event"}, ${adminUserId}, ${"skill"}, ${"bdd-target"}, ${JSON.stringify({ bdd: true })}, ${now})
    ON CONFLICT DO NOTHING
  `;
  world.seededEventId = eventId;
}

// ── Feature ────────────────────────────────────────────────────────────────

describe("Feature: Admin audit log access", () => {
  beforeAll(async () => {
    if (!hasDatabase || !hasRegistry) return;
    const connectionString = process.env.DATABASE_URL!;
    world.sql = postgres(connectionString);
    world.runId = randomUUID().replace(/-/g, "").slice(0, 10);
    world.client = createAdminApiClient(world.registry, world.sql);
    await createAdminSession(world.client, world.runId);
    await givenAuditEventExistsForAdmin();
  }, 30_000);

  afterAll(async () => {
    const sql = world.sql;
    if (!sql) return;
    try {
      if (world.seededEventId) {
        await sql`DELETE FROM audit_events WHERE id = ${world.seededEventId}`;
      }
      if (world.client) await cleanupAdminSession(world.client, world.runId);
    } catch (e) {
      console.warn("admin-audit-logs cleanup warning:", e);
    } finally {
      await sql.end();
    }
  }, 15_000);

  // ── Auth enforcement (C1) ─────────────────────────────────────────

  describe("Scenario: GET /admin/audit-logs as non-admin returns 401 (E2)", () => {
    it.skipIf(!hasDatabase || !hasRegistry)("runs Given/When/Then", async () => {
      const { status } = await adminGet("/api/admin/audit-logs");
      expect(status).toBe(401);
    });
  });

  // ── List events (C4, C5, C6) ──────────────────────────────────────

  describe("Scenario: GET /admin/audit-logs returns paginated events (E1)", () => {
    it.skipIf(!hasDatabase || !hasRegistry)("runs Given/When/Then", async () => {
      const { status, body } = await adminGet("/api/admin/audit-logs", world.client!.session!.cookieHeader);
      expect(status).toBe(200);
      const b = body as Record<string, unknown>;
      expect(b).toHaveProperty("events");
      expect(b).toHaveProperty("total");
      expect(b).toHaveProperty("totalPages");
      expect(Array.isArray(b["events"])).toBe(true);
    });
  });

  // ── Actor join (C4) ────────────────────────────────────────────────

  describe("Scenario: Events include actorName and actorEmail (E5)", () => {
    it.skipIf(!hasDatabase || !hasRegistry)("runs Given/When/Then", async () => {
      const adminUserId = `e2e-admin-${world.runId}`;
      const { status, body } = await adminGet(
        `/api/admin/audit-logs?actorId=${adminUserId}`,
        world.client!.session!.cookieHeader,
      );
      expect(status).toBe(200);
      const events = (body as Record<string, unknown>)["events"] as Array<Record<string, unknown>>;
      expect(Array.isArray(events)).toBe(true);
      expect(events.length).toBeGreaterThanOrEqual(1);
      const hasActorInfo = events.some((e) => e["actorName"] !== undefined || e["actorEmail"] !== undefined);
      expect(hasActorInfo).toBe(true);
    });
  });

  // ── Date filter validation (C3) ───────────────────────────────────

  describe("Scenario: Invalid startDate returns 400 (E4)", () => {
    it.skipIf(!hasDatabase || !hasRegistry)("runs Given/When/Then", async () => {
      const { status, body } = await adminGet(
        "/api/admin/audit-logs?startDate=not-a-date",
        world.client!.session!.cookieHeader,
      );
      expect(status).toBe(400);
      const bodyStr = JSON.stringify(body).toLowerCase();
      expect(bodyStr).toContain("invalid startdate");
    });
  });

  // ── Action filter (C2) ────────────────────────────────────────────

  describe("Scenario: Filter by action returns only matching events (E3)", () => {
    it.skipIf(!hasDatabase || !hasRegistry)("runs Given/When/Then", async () => {
      const { status, body } = await adminGet(
        "/api/admin/audit-logs?action=bdd.test.event",
        world.client!.session!.cookieHeader,
      );
      expect(status).toBe(200);
      const events = (body as Record<string, unknown>)["events"] as Array<Record<string, unknown>>;
      expect(Array.isArray(events)).toBe(true);
      for (const event of events) {
        expect(event["action"]).toBe("bdd.test.event");
      }
    });
  });
});
