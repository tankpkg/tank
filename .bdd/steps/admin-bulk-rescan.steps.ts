/**
 * BDD step definitions for admin bulk rescan of skill versions.
 *
 * Intent: .idd/modules/admin-bulk-rescan/INTENT.md
 * Feature: .bdd/features/admin-bulk-rescan/bulk-rescan.feature
 *
 * Runs against REAL PostgreSQL + REAL registry HTTP — zero mocks.
 * Uses createAdminSession/cleanupAdminSession to provision real admin credentials.
 * POST /api/admin/rescan-skills starts a background job and returns a jobId + total count.
 */
import { randomUUID } from 'node:crypto';

import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const hasDatabase = !!process.env.DATABASE_URL;
const hasRegistry = !!process.env.E2E_REGISTRY_URL;

import {
  type AdminApiClient,
  cleanupAdminSession,
  createAdminApiClient,
  createAdminSession
} from '../interactions/admin-api-client.js';

// ── World ──────────────────────────────────────────────────────────────────

interface BulkRescanWorld {
  registry: string;
  sql: postgres.Sql | null;
  runId: string;
  client: AdminApiClient | null;
}

const world: BulkRescanWorld = {
  registry: process.env.E2E_REGISTRY_URL ?? 'http://localhost:3003',
  sql: null,
  runId: '',
  client: null
};

// ── Helpers ────────────────────────────────────────────────────────────────

async function adminPost(path: string, cookieHeader?: string): Promise<{ status: number; body: unknown }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (cookieHeader) headers['Cookie'] = cookieHeader;
  const res = await fetch(`${world.registry}${path}`, { method: 'POST', headers });
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { status: res.status, body };
}

// ── Feature ────────────────────────────────────────────────────────────────

describe('Feature: Admin bulk rescan of skill versions', () => {
  beforeAll(async () => {
    if (!hasDatabase || !hasRegistry) return;
    const connectionString = process.env.DATABASE_URL!;
    world.sql = postgres(connectionString);
    world.runId = randomUUID().replace(/-/g, '').slice(0, 10);
    world.client = createAdminApiClient(world.registry, world.sql);
    await createAdminSession(world.client, world.runId);
  }, 30_000);

  afterAll(async () => {
    const sql = world.sql;
    if (!sql) return;
    try {
      if (world.client) await cleanupAdminSession(world.client, world.runId);
    } catch (e) {
      console.warn('admin-bulk-rescan cleanup warning:', e);
    } finally {
      await sql.end();
    }
  }, 15_000);

  // ── Auth enforcement (C1) ─────────────────────────────────────────

  describe('Scenario: POST /admin/rescan-skills as non-admin returns 401 (E2)', () => {
    it.skipIf(!hasDatabase || !hasRegistry)('runs Given/When/Then', async () => {
      const { status } = await adminPost('/api/admin/rescan-skills');
      expect(status).toBe(401);
    });
  });

  // ── Bulk rescan (C3) ─────────────────────────────────────────────

  describe('Scenario: POST /admin/rescan-skills returns count of queued versions (E1)', () => {
    it.skipIf(!hasDatabase || !hasRegistry)('runs Given/When/Then', async () => {
      const { status, body } = await adminPost('/api/admin/rescan-skills', world.client!.session!.cookieHeader);
      expect(status).toBe(200);
      const b = body as Record<string, unknown>;
      expect(b).toHaveProperty('total');
      expect(typeof b['total']).toBe('number');
    });
  });

  // ── Job tracking (C4) ────────────────────────────────────────────

  describe('Scenario: Response includes jobId when there are versions to rescan', () => {
    it.skipIf(!hasDatabase || !hasRegistry)('runs Given/When/Then', async () => {
      const { status, body } = await adminPost('/api/admin/rescan-skills', world.client!.session!.cookieHeader);
      expect(status).toBe(200);
      const b = body as Record<string, unknown>;
      const total = b['total'] as number;
      if (total > 0) {
        expect(b).toHaveProperty('jobId');
        expect(typeof b['jobId']).toBe('string');
        expect(b).toHaveProperty('statusUrl');
      } else {
        expect(b['jobId']).toBeNull();
      }
    });
  });
});
