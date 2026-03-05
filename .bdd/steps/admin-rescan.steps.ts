import { randomUUID } from 'node:crypto';
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import postgres from 'postgres';
import {
  createAdminApiClient,
  createAdminSession,
  createTestPackageVersion,
  postRescan,
  cleanupAdminSession,
  type AdminApiClient,
} from '../interactions/admin-api-client.js';

const registry = process.env.E2E_REGISTRY_URL ?? 'http://localhost:3003';
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is required for BDD tests');
}

const sql = postgres(connectionString);
const runId = randomUUID().replace(/-/g, '').slice(0, 10);

let client: AdminApiClient;
let lastResponse: { status: number; body: Record<string, unknown> };

// ── Feature: Admin rescan a specific package version ────────────────────────

describe('Feature: Admin rescan a specific package version', () => {
  beforeAll(async () => {
    client = createAdminApiClient(registry, sql);
  });

  afterAll(async () => {
    await cleanupAdminSession(client, runId);
    await sql.end();
  });

  // ── Scenario: Successfully rescan a version ─────────────────────────────

  describe('Scenario: Successfully rescan a version (scanner unavailable — marks scan-failed)', () => {
    it('Given the Tank registry is running', async () => {
      const res = await fetch(`${registry}/api/health`);
      expect(res.status).toBe(200);
    });

    it('Given an admin user exists with a valid session', async () => {
      await createAdminSession(client, runId);
      expect(client.session).not.toBeNull();
    });

    it('And a published package "@e2e/rescan-test" exists with version "1.0.0"', async () => {
      const result = await createTestPackageVersion(client, {
        runId,
        packageName: `@e2e/rescan-test-${runId}`,
        version: '1.0.0',
        publisherId: client.session!.userId,
      });
      expect(result.versionId).toBeTruthy();
    });

    it('When the admin triggers a rescan for the package version "1.0.0"', async () => {
      lastResponse = await postRescan(client, `@e2e/rescan-test-${runId}`, '1.0.0');
    });

    it('Then the response status should be 200', () => {
      expect(lastResponse.status).toBe(200);
    });

    it('And the response should indicate the rescan was processed', () => {
      expect(lastResponse.body).toHaveProperty('name');
      expect(lastResponse.body).toHaveProperty('version', '1.0.0');
      expect(lastResponse.body).toHaveProperty('auditStatus');
    });

    it('And the version audit status should be updated in the database', async () => {
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
    });
  });

  // ── Scenario: Rescan requires admin authentication ──────────────────────

  describe('Scenario: Rescan requires admin authentication', () => {
    it('When an unauthenticated request triggers a rescan', async () => {
      const unauthClient = createAdminApiClient(registry, sql);
      lastResponse = await postRescan(unauthClient, `@e2e/rescan-test-${runId}`, '1.0.0');
    });

    it('Then the response status should be 401', () => {
      expect(lastResponse.status).toBe(401);
    });
  });

  // ── Scenario: Rescan returns 404 for non-existent package ───────────────

  describe('Scenario: Rescan returns 404 for non-existent package', () => {
    it('Given an admin user exists with a valid session', () => {
      expect(client.session).not.toBeNull();
    });

    it('When the admin triggers a rescan for a non-existent package', async () => {
      lastResponse = await postRescan(client, '@e2e/nonexistent-pkg', '1.0.0');
    });

    it('Then the response status should be 404', () => {
      expect(lastResponse.status).toBe(404);
    });
  });

  // ── Scenario: Rescan returns 404 for non-existent version ───────────────

  describe('Scenario: Rescan returns 404 for non-existent version', () => {
    it('Given an admin user exists with a valid session', () => {
      expect(client.session).not.toBeNull();
    });

    it('When the admin triggers a rescan for a non-existent version', async () => {
      lastResponse = await postRescan(client, `@e2e/rescan-test-${runId}`, '99.99.99');
    });

    it('Then the response status should be 404', () => {
      expect(lastResponse.status).toBe(404);
    });
  });
});
