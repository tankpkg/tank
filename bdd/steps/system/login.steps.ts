/**
 * BDD step definitions for the CLI OAuth login flow.
 *
 * Intent: idd/modules/login/INTENT.md
 * Feature: bdd/features/system/login/login.feature
 *
 * Runs against REAL registry HTTP — zero mocks.
 * Requires E2E_REGISTRY_URL in environment (defaults to http://localhost:3003).
 * Seeds sessions via HTTP (start endpoint), validates exchange behavior.
 */
import { describe, expect, it } from 'vitest';

const hasRegistry = !!process.env.E2E_REGISTRY_URL;

// ── World ──────────────────────────────────────────────────────────────────

interface LoginWorld {
  registry: string;
  lastStatus: number;
  lastBody: Record<string, unknown>;
  sessionCode: string;
  state: string;
}

const world: LoginWorld = {
  registry: process.env.E2E_REGISTRY_URL ?? 'http://localhost:3003',
  lastStatus: 0,
  lastBody: {},
  sessionCode: '',
  state: ''
};

// ── Given ──────────────────────────────────────────────────────────────────

async function givenAPendingLoginSessionExists(): Promise<void> {
  world.state = `bdd-state-${Date.now()}`;
  const res = await fetch(`${world.registry}/api/v1/cli-auth/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ state: world.state })
  });
  const body = (await res.json()) as Record<string, unknown>;
  world.sessionCode = body.sessionCode as string;
}

// ── When ───────────────────────────────────────────────────────────────────

async function whenIInitiateACliLoginSession(): Promise<void> {
  world.state = `bdd-state-${Date.now()}`;
  const res = await fetch(`${world.registry}/api/v1/cli-auth/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ state: world.state })
  });
  world.lastStatus = res.status;
  world.lastBody = (await res.json()) as Record<string, unknown>;
}

async function whenIInitiateACliLoginSessionWithoutState(): Promise<void> {
  const res = await fetch(`${world.registry}/api/v1/cli-auth/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  });
  world.lastStatus = res.status;
  world.lastBody = (await res.json()) as Record<string, unknown>;
}

async function whenIExchangeSessionCodeForToken(sessionCode: string, state: string): Promise<void> {
  const res = await fetch(`${world.registry}/api/v1/cli-auth/exchange`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionCode, state })
  });
  world.lastStatus = res.status;
  world.lastBody = (await res.json()) as Record<string, unknown>;
}

async function whenIExchangeSessionCodeWithMismatchedState(): Promise<void> {
  const res = await fetch(`${world.registry}/api/v1/cli-auth/exchange`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionCode: world.sessionCode, state: 'wrong-state-bdd' })
  });
  world.lastStatus = res.status;
  world.lastBody = await res.json().catch(async () => {
    await res.text().catch(() => '');
    return {} as Record<string, unknown>;
  });
}

// ── Then ───────────────────────────────────────────────────────────────────

function thenStatusIs(code: number): void {
  expect(world.lastStatus).toBe(code);
}

function thenStatusIs400Or404(): void {
  expect([400, 404]).toContain(world.lastStatus);
}

function thenBodyContainsKey(key: string): void {
  expect(world.lastBody).toHaveProperty(key);
}

function thenErrorContains(substring: string): void {
  const errorStr = JSON.stringify(world.lastBody).toLowerCase();
  expect(errorStr).toContain(substring.toLowerCase());
}

// ── Feature ────────────────────────────────────────────────────────────────

describe('Feature: CLI OAuth login flow via browser handshake', () => {
  // ── Start session (C1, C2) ────────────────────────────────────────

  describe('Scenario: Starting a login session returns authUrl and sessionCode (E1)', () => {
    it.skipIf(!hasRegistry)('runs Given/When/Then', async () => {
      await whenIInitiateACliLoginSession();
      thenStatusIs(200);
      thenBodyContainsKey('authUrl');
      thenBodyContainsKey('sessionCode');
    });
  });

  describe('Scenario: Start without state returns 400 (E2)', () => {
    it.skipIf(!hasRegistry)('runs Given/When/Then', async () => {
      await whenIInitiateACliLoginSessionWithoutState();
      thenStatusIs(400);
      thenErrorContains('state');
    });
  });

  // ── Exchange before authorization (C3) ───────────────────────────

  describe('Scenario: Polling exchange before authorization returns 400 (E3)', () => {
    it.skipIf(!hasRegistry)('runs Given/When/Then', async () => {
      await givenAPendingLoginSessionExists();
      await whenIExchangeSessionCodeForToken(world.sessionCode, world.state);
      thenStatusIs(400);
    });
  });

  // ── State validation (C7) ─────────────────────────────────────────

  describe('Scenario: Exchange with mismatched state is rejected (E5)', () => {
    it.skipIf(!hasRegistry)('runs Given/When/Then', async () => {
      await givenAPendingLoginSessionExists();
      await whenIExchangeSessionCodeWithMismatchedState();
      thenStatusIs400Or404();
    });
  });
});
