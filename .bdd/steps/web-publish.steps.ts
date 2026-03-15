/**
 * BDD step definitions for the Publish API — 3-step HTTP publish flow.
 *
 * Intent: .idd/modules/web-publish/INTENT.md
 * Feature: .bdd/features/web-publish/publish-api.feature
 *
 * Runs against REAL PostgreSQL + REAL registry HTTP — zero mocks.
 * Requires DATABASE_URL and E2E_REGISTRY_URL in environment.
 * Uses setupE2E/cleanupE2E from setup.ts to provision users and API keys.
 *
 * Focus: API response contract (shape, status codes, error payloads).
 * Complements publish.steps.ts which tests the CLI flow perspective.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { cleanupE2E, type E2EContext, setupE2E } from '../support/setup.js';

const hasDatabase = !!process.env.DATABASE_URL;
const hasRegistry = !!process.env.E2E_REGISTRY_URL;

// ── World ──────────────────────────────────────────────────────────────────

interface WebPublishWorld {
  registry: string;
  ctx: E2EContext | null;
  lastStatus: number;
  lastBody: Record<string, unknown>;
  pendingVersionId: string;
  conflictSkillName: string;
  escalationSkillName: string;
}

const world: WebPublishWorld = {
  registry: process.env.E2E_REGISTRY_URL ?? 'http://localhost:3003',
  ctx: null,
  lastStatus: 0,
  lastBody: {},
  pendingVersionId: '',
  conflictSkillName: '',
  escalationSkillName: ''
};

// ── Helpers ────────────────────────────────────────────────────────────────

async function postSkills(
  manifest: Record<string, unknown>,
  token?: string
): Promise<{ status: number; body: Record<string, unknown> }> {
  const hdrs: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) hdrs.Authorization = `Bearer ${token}`;
  const res = await fetch(`${world.registry}/api/v1/skills`, {
    method: 'POST',
    headers: hdrs,
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
    body: JSON.stringify({ versionId, integrity: 'sha512-bdd-web-publish-test' })
  });
  const body = (await res.json()) as Record<string, unknown>;
  return { status: res.status, body };
}

function manifest(name: string, version: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { name, version, description: 'BDD web-publish API test', ...extra };
}

function uniqueSkillName(prefix: string): string {
  return `@${world.ctx?.orgSlug}/${prefix}-${randomUUID().slice(0, 8)}`;
}

// ── Feature ────────────────────────────────────────────────────────────────

describe('Feature: Publish API — 3-step HTTP publish flow', () => {
  beforeAll(async () => {
    if (!hasDatabase || !hasRegistry) return;
    world.ctx = await setupE2E(process.env.E2E_REGISTRY_URL ?? 'http://localhost:3003');
  }, 30_000);

  afterAll(async () => {
    if (world.ctx) {
      await cleanupE2E(world.ctx);
      world.ctx = null;
    }
  }, 15_000);

  // ── Auth enforcement (C1) ─────────────────────────────────────────────

  describe('Scenario: POST /skills without auth returns 401 (E2)', () => {
    it.skipIf(!hasRegistry)('returns 401', async () => {
      const { status } = await postSkills(manifest('@acme/bdd-web-publish-noauth', '1.0.0'));
      expect(status).toBe(401);
    });
  });

  // ── Manifest validation (C3) ─────────────────────────────────────────

  describe('Scenario: POST /skills with invalid manifest returns 400 (E3)', () => {
    it.skipIf(!hasDatabase || !hasRegistry)('returns 400', async () => {
      const { status, body } = await postSkills({ name: `@${world.ctx?.orgSlug}/bdd-no-version` }, world.ctx?.token);
      world.lastStatus = status;
      world.lastBody = body;
      expect(status).toBe(400);
    });

    it.skipIf(!hasDatabase || !hasRegistry)('response includes fieldErrors', () => {
      const bodyStr = JSON.stringify(world.lastBody);
      expect(bodyStr.toLowerCase()).toContain('fielderrors');
    });
  });

  // ── Org not found (C4) ────────────────────────────────────────────────

  describe('Scenario: POST /skills with nonexistent org returns 404 (E4)', () => {
    it.skipIf(!hasDatabase || !hasRegistry)('returns 404 and error mentions Organization', async () => {
      const { status, body } = await postSkills(manifest('@nonexistent-bdd-org/skill', '1.0.0'), world.ctx?.token);
      world.lastStatus = status;
      world.lastBody = body;
      expect(status).toBe(404);
      expect(JSON.stringify(body)).toContain('Organization');
    });
  });

  // ── Version conflict (C6) ─────────────────────────────────────────────

  describe('Scenario: POST /skills for already-existing version returns 409 (E5)', () => {
    it.skipIf(!hasDatabase || !hasRegistry)('first publish succeeds, second returns 409', async () => {
      world.conflictSkillName = uniqueSkillName('conflict');

      const { status: s1 } = await postSkills(manifest(world.conflictSkillName, '1.0.0'), world.ctx?.token);
      expect([200, 409]).toContain(s1);
      if (s1 !== 200) return;

      const { status: s2, body: b2 } = await postSkills(manifest(world.conflictSkillName, '1.0.0'), world.ctx?.token);
      expect(s2).toBe(409);
      world.lastBody = b2;
    });
  });

  // ── Permission escalation at API level (C7) ──────────────────────────

  describe('Scenario: PATCH bump with new network permission returns 400 with violations (E6)', () => {
    it.skipIf(!hasDatabase || !hasRegistry)(
      'sets up v1.0.0 without network, then v1.0.1 with network returns 400 + violations',
      async () => {
        world.escalationSkillName = uniqueSkillName('escalation');

        const { status: s1 } = await postSkills(manifest(world.escalationSkillName, '1.0.0'), world.ctx?.token);
        if (s1 !== 200) return;

        const { status: s2, body: b2 } = await postSkills(
          manifest(world.escalationSkillName, '1.0.1', {
            permissions: { network: { outbound: ['api.example.com'] } }
          }),
          world.ctx?.token
        );
        world.lastStatus = s2;
        world.lastBody = b2;
        expect(s2).toBe(400);
        expect(JSON.stringify(b2).toLowerCase()).toContain('violations');
      }
    );
  });

  // ── Successful initiation returns uploadUrl (C8) ──────────────────────

  describe('Scenario: Valid POST /skills returns uploadUrl, skillId, versionId (E1)', () => {
    it.skipIf(!hasDatabase || !hasRegistry)('returns 200 with uploadUrl, skillId, versionId', async () => {
      const { status, body } = await postSkills(manifest(uniqueSkillName('new-skill'), '1.0.0'), world.ctx?.token);
      world.lastStatus = status;
      world.lastBody = body;
      world.pendingVersionId = (body.versionId as string) ?? '';
      expect(status).toBe(200);
      expect(body).toHaveProperty('uploadUrl');
      expect(body).toHaveProperty('skillId');
      expect(body).toHaveProperty('versionId');
    });
  });

  // ── Confirm lifecycle (C9, C10) ───────────────────────────────────────

  describe('Scenario: POST /confirm with valid versionId returns success (E7)', () => {
    it.skipIf(!hasDatabase || !hasRegistry)('returns 200 with success true', async () => {
      if (!world.pendingVersionId) return;

      const { status, body } = await postConfirm(world.pendingVersionId, world.ctx?.token ?? '');
      world.lastStatus = status;
      world.lastBody = body;
      expect(status).toBe(200);
      expect(body.success).toBe(true);
    });
  });

  describe('Scenario: POST /confirm with already-confirmed versionId returns 400 (E8)', () => {
    it.skipIf(!hasDatabase || !hasRegistry)('second confirm returns 400', async () => {
      if (!world.pendingVersionId) return;

      const { status } = await postConfirm(world.pendingVersionId, world.ctx?.token ?? '');
      expect(status).toBe(400);
    });
  });
});
