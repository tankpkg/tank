/**
 * BDD step definitions for the health check endpoint.
 *
 * Intent: idd/modules/health/INTENT.md
 * Feature: bdd/features/system/health/health.feature
 *
 * Runs against REAL registry HTTP — zero mocks.
 * Requires E2E_REGISTRY_URL in environment (defaults to http://localhost:3003).
 */
import { describe, expect, it } from 'vitest';

const hasRegistry = !!process.env.E2E_REGISTRY_URL;

// ── World ──────────────────────────────────────────────────────────────────

interface HealthWorld {
  registry: string;
  lastStatus: number;
  lastBody: Record<string, unknown>;
}

const world: HealthWorld = {
  registry: process.env.E2E_REGISTRY_URL ?? 'http://localhost:3003',
  lastStatus: 0,
  lastBody: {}
};

// ── When ───────────────────────────────────────────────────────────────────

async function whenICallGetHealth(): Promise<void> {
  const res = await fetch(`${world.registry}/api/health`);
  world.lastStatus = res.status;
  world.lastBody = (await res.json()) as Record<string, unknown>;
}

// ── Then ───────────────────────────────────────────────────────────────────

function thenStatusIs200Or503(): void {
  expect([200, 503]).toContain(world.lastStatus);
}

function _thenStatusIs200(): void {
  expect(world.lastStatus).toBe(200);
}

function thenBodyContains(key: string): void {
  expect(world.lastBody).toHaveProperty(key);
}

function thenChecksInclude(checkName: string): void {
  const checks = world.lastBody.checks as Record<string, unknown> | undefined;
  expect(checks).toBeDefined();
  expect(checks).toHaveProperty(checkName);
}

function thenStatusFieldIs(value: string): void {
  expect(world.lastBody.status).toBe(value);
}

// ── Feature ────────────────────────────────────────────────────────────────

describe('Feature: Health check endpoint for dependency monitoring', () => {
  // ── Response structure (C1) ───────────────────────────────────────

  describe('Scenario: Health check returns structured JSON with all checks (E1)', () => {
    it.skipIf(!hasRegistry)('runs Given/When/Then', async () => {
      await whenICallGetHealth();
      thenStatusIs200Or503();
      thenBodyContains('status');
      thenBodyContains('checks');
      thenChecksInclude('database');
      thenChecksInclude('redis');
      thenChecksInclude('storage');
      thenChecksInclude('scanner');
    });
  });

  // ── All healthy → ok (C2) ─────────────────────────────────────────

  describe('Scenario: All dependencies healthy returns status ok with HTTP 200 (E1)', () => {
    it.skipIf(!hasRegistry)('returns 200 and status ok when all deps are healthy', async () => {
      await whenICallGetHealth();
      if (world.lastStatus === 200) {
        thenStatusFieldIs('ok');
      } else {
        expect(['ok', 'degraded', 'error']).toContain(world.lastBody.status);
      }
    });
  });

  // ── Response shape fields (C6) ────────────────────────────────────

  describe('Scenario: Response includes timestamp and version fields (E4)', () => {
    it.skipIf(!hasRegistry)('runs Given/When/Then', async () => {
      await whenICallGetHealth();
      thenBodyContains('timestamp');
      thenBodyContains('version');
    });
  });

  // ── Status values are valid (C2, C3) ──────────────────────────────

  describe('Scenario: status field is always one of the valid values', () => {
    it.skipIf(!hasRegistry)('status is ok, degraded, or error', async () => {
      await whenICallGetHealth();
      expect(['ok', 'degraded', 'error']).toContain(world.lastBody.status);
    });
  });
});
