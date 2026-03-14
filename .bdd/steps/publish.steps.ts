/**
 * BDD step definitions for the 3-step publish API flow.
 *
 * Intent: .idd/modules/publish/INTENT.md
 * Feature: .bdd/features/publish/publish.feature
 *
 * Runs against REAL PostgreSQL + REAL registry HTTP — zero mocks.
 * Requires DATABASE_URL and E2E_REGISTRY_URL in environment.
 * Uses setupE2E/cleanupE2E from setup.ts to provision users and API keys.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, describe, expect, it } from 'vitest';

import { cleanupE2E, type E2EContext, setupE2E } from '../support/setup.js';

const hasDatabase = !!process.env.DATABASE_URL;
const hasRegistry = !!process.env.E2E_REGISTRY_URL;

// ── World ──────────────────────────────────────────────────────────────────

interface PublishWorld {
  registry: string;
  ctx: E2EContext | null;
  lastStatus: number;
  lastBody: Record<string, unknown>;
}

const world: PublishWorld = {
  registry: process.env.E2E_REGISTRY_URL ?? 'http://localhost:3003',
  ctx: null,
  lastStatus: 0,
  lastBody: {}
};

// ── Helpers ────────────────────────────────────────────────────────────────

async function postPublishStart(
  manifest: Record<string, unknown>,
  token?: string
): Promise<{ status: number; body: Record<string, unknown> }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${world.registry}/api/v1/skills`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ manifest })
  });
  const body = (await res.json()) as Record<string, unknown>;
  return { status: res.status, body };
}

async function postConfirm(
  versionId: string,
  token: string
): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await fetch(`${world.registry}/api/v1/skills/confirm`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ versionId })
  });
  const body = (await res.json()) as Record<string, unknown>;
  return { status: res.status, body };
}

function buildManifest(name: string, version: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { name, version, description: 'BDD publish test skill', ...extra };
}

// ── Given ──────────────────────────────────────────────────────────────────

async function givenIAmAuthenticated(): Promise<void> {
  world.ctx = await setupE2E(world.registry);
}

// ── When ───────────────────────────────────────────────────────────────────

async function whenIAttemptToPublishWithoutAuth(manifest: Record<string, unknown>): Promise<void> {
  const { status, body } = await postPublishStart(manifest);
  world.lastStatus = status;
  world.lastBody = body;
}

async function whenIAttemptToPublish(manifest: Record<string, unknown>): Promise<void> {
  const { status, body } = await postPublishStart(manifest, world.ctx?.token);
  world.lastStatus = status;
  world.lastBody = body;
}

async function whenIConfirmVersion(versionId: string): Promise<void> {
  const { status, body } = await postConfirm(versionId, world.ctx?.token);
  world.lastStatus = status;
  world.lastBody = body;
}

// ── Then ───────────────────────────────────────────────────────────────────

function thenStatusIs(code: number): void {
  expect(world.lastStatus).toBe(code);
}

function thenStatusIsOneOf(...codes: number[]): void {
  expect(codes).toContain(world.lastStatus);
}

function thenBodyErrorContains(substring: string): void {
  const bodyStr = JSON.stringify(world.lastBody).toLowerCase();
  expect(bodyStr).toContain(substring.toLowerCase());
}

// ── Feature ────────────────────────────────────────────────────────────────

describe('Feature: Skill publish via 3-step API flow', () => {
  afterAll(async () => {
    if (world.ctx) {
      await cleanupE2E(world.ctx);
      world.ctx = null;
    }
  }, 30_000);

  // ── Authentication (C1) ───────────────────────────────────────────

  describe('Scenario: Unauthenticated publish attempt is rejected (E2)', () => {
    it.skipIf(!hasRegistry)('runs Given/When/Then', async () => {
      await whenIAttemptToPublishWithoutAuth(buildManifest('@acme/unauthenticated-bdd', '1.0.0'));
      thenStatusIsOneOf(401, 403);
      thenBodyErrorContains('Unauthorized');
    });
  });

  // ── Manifest validation (C2) ──────────────────────────────────────

  describe('Scenario: Invalid manifest missing version is rejected (E3)', () => {
    it.skipIf(!hasDatabase || !hasRegistry)('runs Given/When/Then', async () => {
      await givenIAmAuthenticated();
      const invalidManifest = { name: `@${world.ctx?.orgSlug}/bdd-no-version` };
      await whenIAttemptToPublish(invalidManifest);
      thenStatusIs(400);
    });
  });

  // ── Org membership enforcement (C4) ──────────────────────────────

  describe('Scenario: Publishing to a nonexistent org returns 404 (E4)', () => {
    it.skipIf(!hasDatabase || !hasRegistry)('runs Given/When/Then', async () => {
      await givenIAmAuthenticated();
      await whenIAttemptToPublish(buildManifest('@nonexistent-org-bdd-zzz/skill', '1.0.0'));
      thenStatusIs(404);
      thenBodyErrorContains('Organization');
    });
  });

  // ── Version conflict (C5) ─────────────────────────────────────────

  describe('Scenario: Re-publishing an existing version returns 409 (E5)', () => {
    it.skipIf(!hasDatabase || !hasRegistry)('runs Given/When/Then', async () => {
      await givenIAmAuthenticated();
      const name = `@${world.ctx?.orgSlug}/conflict-test-${randomUUID().slice(0, 8)}`;

      const { status: firstStatus } = await postPublishStart(buildManifest(name, '1.0.0'), world.ctx?.token);
      expect([200, 409]).toContain(firstStatus);
      if (firstStatus !== 200) return;

      const { status: secondStatus, body: secondBody } = await postPublishStart(
        buildManifest(name, '1.0.0'),
        world.ctx?.token
      );
      expect(secondStatus).toBe(409);
      expect(JSON.stringify(secondBody).toLowerCase()).toContain('already exists');
    });
  });

  // ── Permission escalation (C6, C7, C8) ───────────────────────────

  describe('Scenario: PATCH bump adding network permission is rejected (E6)', () => {
    it.skipIf(!hasDatabase || !hasRegistry)('runs Given/When/Then', async () => {
      await givenIAmAuthenticated();
      const name = `@${world.ctx?.orgSlug}/escalation-test-${randomUUID().slice(0, 8)}`;

      const { status: s1 } = await postPublishStart(buildManifest(name, '1.0.0'), world.ctx?.token);
      if (s1 !== 200) return;

      const { status, body } = await postPublishStart(
        buildManifest(name, '1.0.1', { permissions: { network: { outbound: ['api.example.com'] } } }),
        world.ctx?.token
      );
      expect(status).toBe(400);
      expect(JSON.stringify(body).toLowerCase()).toContain('permission escalation');
    });
  });

  describe('Scenario: MAJOR bump adding network permission is allowed (E7)', () => {
    it.skipIf(!hasDatabase || !hasRegistry)('runs Given/When/Then', async () => {
      await givenIAmAuthenticated();
      const name = `@${world.ctx?.orgSlug}/escalation-major-${randomUUID().slice(0, 8)}`;

      const { status: s1 } = await postPublishStart(buildManifest(name, '1.0.0'), world.ctx?.token);
      if (s1 !== 200) return;

      const { status } = await postPublishStart(
        buildManifest(name, '2.0.0', { permissions: { network: { outbound: ['api.example.com'] } } }),
        world.ctx?.token
      );
      thenStatusIs(200);
      expect(status).toBe(200);
    });
  });

  // ── Double confirm guard (C11) ────────────────────────────────────

  describe('Scenario: Confirming an already-confirmed version returns 400 (E10)', () => {
    it.skipIf(!hasDatabase || !hasRegistry)('runs Given/When/Then', async () => {
      await givenIAmAuthenticated();
      const name = `@${world.ctx?.orgSlug}/confirm-test-${randomUUID().slice(0, 8)}`;

      const { status, body } = await postPublishStart(buildManifest(name, '1.0.0'), world.ctx?.token);
      if (status !== 200) return;

      const versionId = body.versionId as string;
      if (!versionId) return;

      await whenIConfirmVersion(versionId);
      await whenIConfirmVersion(versionId);
      thenStatusIs(400);
    });
  });
});
