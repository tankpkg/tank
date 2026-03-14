import { randomUUID } from 'node:crypto';

import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  type AdminApiClient,
  cleanupAdminSession,
  createAdminApiClient,
  createAdminSession,
  createTestPackageVersion,
  postRescan
} from '../interactions/admin-api-client.js';

const registry = process.env.E2E_REGISTRY_URL ?? 'http://localhost:3003';
const connectionString = process.env.DATABASE_URL;

const hasDatabase = !!connectionString;
const hasRegistry = !!process.env.E2E_REGISTRY_URL;

const sql = hasDatabase ? postgres(connectionString!) : (null as unknown as ReturnType<typeof postgres>);
const runId = randomUUID().replace(/-/g, '').slice(0, 10);

let client: AdminApiClient;
let lastResponse: { status: number; body: Record<string, unknown> };

// ── Feature: Admin rescan a specific package version ────────────────────────

describe('Feature: Admin rescan a specific package version', () => {
  beforeAll(async () => {
    if (!hasDatabase || !hasRegistry) return;
    client = createAdminApiClient(registry, sql);
  });

  afterAll(async () => {
    if (hasDatabase && hasRegistry) {
      await cleanupAdminSession(client, runId);
    }
    if (hasDatabase) {
      await sql.end();
    }
  });

  // ── Scenario: Successfully rescan a version ─────────────────────────────

  describe('Scenario: Successfully rescan a version (scanner unavailable — marks scan-failed)', () => {
    it.skipIf(!hasDatabase || !hasRegistry)('Given the Tank registry is running', async () => {
      const res = await fetch(`${registry}/api/health`);
      expect(res.status).toBe(200);
    });

    it.skipIf(!hasDatabase || !hasRegistry)('Given an admin user exists with a valid session', async () => {
      await createAdminSession(client, runId);
      expect(client.session).not.toBeNull();
    });

    it.skipIf(!hasDatabase || !hasRegistry)(
      'And a published package "@e2e/rescan-test" exists with version "1.0.0"',
      async () => {
        const result = await createTestPackageVersion(client, {
          runId,
          packageName: `@e2e/rescan-test-${runId}`,
          version: '1.0.0',
          publisherId: client.session!.userId
        });
        expect(result.versionId).toBeTruthy();
      }
    );

    it.skipIf(!hasDatabase || !hasRegistry)(
      'When the admin triggers a rescan for the package version "1.0.0"',
      async () => {
        lastResponse = await postRescan(client, `@e2e/rescan-test-${runId}`, '1.0.0');
      }
    );

    it.skipIf(!hasDatabase || !hasRegistry)('Then the response status should be 200', () => {
      expect(lastResponse.status).toBe(200);
    });

    it.skipIf(!hasDatabase || !hasRegistry)('And the response should indicate the rescan was processed', () => {
      expect(lastResponse.body).toHaveProperty('name');
      expect(lastResponse.body).toHaveProperty('version', '1.0.0');
      expect(lastResponse.body).toHaveProperty('auditStatus');
    });

    it.skipIf(!hasDatabase || !hasRegistry)(
      'And the version audit status should be updated in the database',
      async () => {
        const [row] = await sql`
        SELECT audit_status FROM skill_versions
        WHERE skill_id IN (SELECT id FROM skills WHERE name = ${`@e2e/rescan-test-${runId}`})
        AND version = '1.0.0'
        LIMIT 1
      `;
        expect(row).toBeTruthy();
        // Without a running Python scanner, status will be 'scan-failed'.
        // With a running scanner, it would be 'completed', 'flagged', or 'failed'.
        expect(row.audit_status).not.toBe('pending');
      }
    );
  });

  // ── Scenario: Rescan requires admin authentication ──────────────────────

  describe('Scenario: Rescan requires admin authentication', () => {
    it.skipIf(!hasDatabase || !hasRegistry)('When an unauthenticated request triggers a rescan', async () => {
      const unauthClient = createAdminApiClient(registry, sql);
      lastResponse = await postRescan(unauthClient, `@e2e/rescan-test-${runId}`, '1.0.0');
    });

    it.skipIf(!hasDatabase || !hasRegistry)('Then the response status should be 401', () => {
      expect(lastResponse.status).toBe(401);
    });
  });

  // ── Scenario: Rescan returns 404 for non-existent package ───────────────

  describe('Scenario: Rescan returns 404 for non-existent package', () => {
    it.skipIf(!hasDatabase || !hasRegistry)('Given an admin user exists with a valid session', () => {
      expect(client.session).not.toBeNull();
    });

    it.skipIf(!hasDatabase || !hasRegistry)('When the admin triggers a rescan for a non-existent package', async () => {
      lastResponse = await postRescan(client, '@e2e/nonexistent-pkg', '1.0.0');
    });

    it.skipIf(!hasDatabase || !hasRegistry)('Then the response status should be 404', () => {
      expect(lastResponse.status).toBe(404);
    });
  });

  // ── Scenario: Rescan returns 404 for non-existent version ───────────────

  describe('Scenario: Rescan returns 404 for non-existent version', () => {
    it.skipIf(!hasDatabase || !hasRegistry)('Given an admin user exists with a valid session', () => {
      expect(client.session).not.toBeNull();
    });

    it.skipIf(!hasDatabase || !hasRegistry)('When the admin triggers a rescan for a non-existent version', async () => {
      lastResponse = await postRescan(client, `@e2e/rescan-test-${runId}`, '99.99.99');
    });

    it.skipIf(!hasDatabase || !hasRegistry)('Then the response status should be 404', () => {
      expect(lastResponse.status).toBe(404);
    });
  });
});
