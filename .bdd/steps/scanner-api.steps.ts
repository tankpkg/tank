/**
 * BDD step definitions for the Python scanner API.
 *
 * Intent: .idd/modules/scanner-api/INTENT.md
 * Feature: .bdd/features/scanner-api/scanner-api.feature
 *
 * Runs against REAL scanner HTTP — zero mocks.
 * Requires SCANNER_URL in environment (defaults to http://localhost:8000).
 */
import { describe, expect, it } from 'vitest';

const hasScanner = !!process.env.SCANNER_URL;

// ── World ──────────────────────────────────────────────────────────────────

interface ScannerWorld {
  scannerUrl: string;
  lastStatus: number;
  lastBody: Record<string, unknown>;
}

const world: ScannerWorld = {
  scannerUrl: process.env.SCANNER_URL ?? 'http://localhost:8000',
  lastStatus: 0,
  lastBody: {}
};

const VALID_VERDICTS = ['pass', 'pass_with_notes', 'flagged', 'fail'];

// ── When ───────────────────────────────────────────────────────────────────

async function whenICallGetHealthOnScanner(): Promise<void> {
  const res = await fetch(`${world.scannerUrl}/health`);
  world.lastStatus = res.status;
  world.lastBody = (await res.json()) as Record<string, unknown>;
}

async function whenIPostScanWithoutTarballUrl(): Promise<void> {
  const res = await fetch(`${world.scannerUrl}/api/analyze/scan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ version_id: 'test-version', manifest: {}, permissions: {} })
  });
  world.lastStatus = res.status;
  world.lastBody = (await res.json().catch(() => ({}))) as Record<string, unknown>;
}

async function whenIPostValidScanRequest(): Promise<void> {
  const res = await fetch(`${world.scannerUrl}/api/analyze/scan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tarball_url: 'https://example.com/test-skill-1.0.0.tgz',
      version_id: 'bdd-test-version-id',
      manifest: { name: '@bdd/test-skill', version: '1.0.0' },
      permissions: {}
    })
  });
  world.lastStatus = res.status;
  world.lastBody = (await res.json()) as Record<string, unknown>;
}

// ── Then ───────────────────────────────────────────────────────────────────

function thenStatusIs(code: number): void {
  expect(world.lastStatus).toBe(code);
}

function thenBodyContainsKey(key: string): void {
  expect(world.lastBody).toHaveProperty(key);
}

function thenBodyHasKeyValue(key: string, value: unknown): void {
  expect(world.lastBody[key]).toBe(value);
}

function thenVerdictIsValid(): void {
  const verdict = world.lastBody.verdict;
  expect(VALID_VERDICTS).toContain(verdict);
}

// ── Feature ────────────────────────────────────────────────────────────────

describe('Feature: Python scanner API integration', () => {
  // ── Health check (C4) ────────────────────────────────────────────

  describe('Scenario: GET /health returns 200 with status ok (E1)', () => {
    it.skipIf(!hasScanner)('runs Given/When/Then', async () => {
      await whenICallGetHealthOnScanner();
      thenStatusIs(200);
      thenBodyHasKeyValue('status', 'healthy');
    });
  });

  // ── Scan request validation (C5) ─────────────────────────────────

  describe('Scenario: POST /api/analyze/scan with missing tarball_url returns 422 (E3)', () => {
    it.skipIf(!hasScanner)('runs Given/When/Then', async () => {
      await whenIPostScanWithoutTarballUrl();
      thenStatusIs(422);
    });
  });

  // ── Structured scan response (C2) ────────────────────────────────

  describe('Scenario: POST /api/analyze/scan returns verdict and findings (E2)', () => {
    it.skipIf(!hasScanner)('runs Given/When/Then', async () => {
      await whenIPostValidScanRequest();
      thenStatusIs(200);
      thenBodyContainsKey('verdict');
      thenBodyContainsKey('findings');
      thenBodyContainsKey('stage_results');
      thenBodyContainsKey('duration_ms');
    });
  });

  // ── Verdict values (C3) ───────────────────────────────────────────

  describe('Scenario: Verdict is one of the four valid values (E4)', () => {
    it.skipIf(!hasScanner)('runs Given/When/Then', async () => {
      await whenIPostValidScanRequest();
      thenVerdictIsValid();
    });
  });
});
