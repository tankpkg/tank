/**
 * BDD step definitions for permission escalation detection logic.
 *
 * Intent: .idd/modules/permission-escalation/INTENT.md
 * Feature: .bdd/features/permission-escalation/escalation.feature
 *
 * Pure logic tests — no DB, no HTTP, no mocks.
 * Imports checkPermissionEscalation directly from the source module.
 */
import { describe, expect, it } from 'vitest';

import {
  checkPermissionEscalation,
  type EscalationCheckResult,
  type VersionPermissions
} from '../../apps/web/lib/permission-escalation';

// ── World ──────────────────────────────────────────────────────────────────

interface EscalationWorld {
  oldVersion: string;
  oldPerms: VersionPermissions;
  newVersion: string;
  newPerms: VersionPermissions;
  result: EscalationCheckResult | null;
}

const world: EscalationWorld = {
  oldVersion: '1.0.0',
  oldPerms: {},
  newVersion: '1.0.1',
  newPerms: {},
  result: null
};

// ── Given ──────────────────────────────────────────────────────────────────

function givenPreviousVersionHasNoNetworkPermissions(version: string): void {
  world.oldVersion = version;
  world.oldPerms = {};
}

function givenPreviousVersionHasSubprocessDisabled(version: string): void {
  world.oldVersion = version;
  world.oldPerms = { subprocess: false };
}

function givenPreviousVersionHasNetworkOutbound(version: string, domain: string): void {
  world.oldVersion = version;
  world.oldPerms = { network: { outbound: [domain] } };
}

function givenPreviousVersionHasNoFilesystemWrite(version: string): void {
  world.oldVersion = version;
  world.oldPerms = {};
}

function givenPreviousVersionHasNoFilesystemRead(version: string): void {
  world.oldVersion = version;
  world.oldPerms = {};
}

function givenPreviousVersionHasNoPermissions(version: string): void {
  world.oldVersion = version;
  world.oldPerms = {};
}

// ── When ───────────────────────────────────────────────────────────────────

function whenCheckingEscalationWithNetworkOutboundAdded(newVersion: string): void {
  world.newVersion = newVersion;
  world.newPerms = { network: { outbound: ['api.example.com'] } };
  world.result = checkPermissionEscalation(world.oldVersion, world.oldPerms, world.newVersion, world.newPerms);
}

function whenCheckingEscalationWithSubprocessEnabled(newVersion: string): void {
  world.newVersion = newVersion;
  world.newPerms = { subprocess: true };
  world.result = checkPermissionEscalation(world.oldVersion, world.oldPerms, world.newVersion, world.newPerms);
}

function whenCheckingEscalationWithFilesystemReadAdded(newVersion: string): void {
  world.newVersion = newVersion;
  world.newPerms = { filesystem: { read: ['./src/**'] } };
  world.result = checkPermissionEscalation(world.oldVersion, world.oldPerms, world.newVersion, world.newPerms);
}

function whenCheckingEscalationWithFilesystemWriteAdded(newVersion: string): void {
  world.newVersion = newVersion;
  world.newPerms = { filesystem: { write: ['./output/**'] } };
  world.result = checkPermissionEscalation(world.oldVersion, world.oldPerms, world.newVersion, world.newPerms);
}

function whenCheckingEscalationWithSamePermissions(newVersion: string, domain: string): void {
  world.newVersion = newVersion;
  world.newPerms = { network: { outbound: [domain] } };
  world.result = checkPermissionEscalation(world.oldVersion, world.oldPerms, world.newVersion, world.newPerms);
}

function whenCheckingEscalationWithNetworkOutboundRemoved(newVersion: string): void {
  world.newVersion = newVersion;
  world.newPerms = {};
  world.result = checkPermissionEscalation(world.oldVersion, world.oldPerms, world.newVersion, world.newPerms);
}

function whenCheckingEscalationWithNoPreviousVersion(newPerms: VersionPermissions): void {
  // First publish: pass empty strings for old — the function handles null/unknown bump gracefully
  // We simulate "no previous version" by passing a fresh check with explicit empty old state
  world.result = checkPermissionEscalation('', {}, '1.0.0', newPerms);
}

// ── Then ───────────────────────────────────────────────────────────────────

function thenResultIsAllowed(): void {
  expect(world.result).not.toBeNull();
  expect(world.result!.allowed).toBe(true);
  expect(world.result!.violations).toHaveLength(0);
}

function thenResultIsNotAllowed(): void {
  expect(world.result).not.toBeNull();
  expect(world.result!.allowed).toBe(false);
  expect(world.result!.violations.length).toBeGreaterThan(0);
}

function thenViolationsMention(keyword: string): void {
  expect(world.result).not.toBeNull();
  const mentionsKeyword = world.result!.violations.some((v: string) => v.toUpperCase().includes(keyword.toUpperCase()));
  expect(mentionsKeyword).toBe(true);
}

// ── Feature ────────────────────────────────────────────────────────────────

describe('Feature: Permission escalation detection logic', () => {
  // ── MAJOR bump always allowed (C1) ────────────────────────────────

  describe('Scenario: MAJOR bump with any new permission is allowed (E1)', () => {
    it('runs Given/When/Then', () => {
      givenPreviousVersionHasNoNetworkPermissions('1.0.0');
      whenCheckingEscalationWithNetworkOutboundAdded('2.0.0');
      thenResultIsAllowed();
    });
  });

  // ── MINOR bump rules (C2) ──────────────────────────────────────────

  describe('Scenario: MINOR bump adding network.outbound is blocked (E2)', () => {
    it('runs Given/When/Then', () => {
      givenPreviousVersionHasNoNetworkPermissions('1.0.0');
      whenCheckingEscalationWithNetworkOutboundAdded('1.1.0');
      thenResultIsNotAllowed();
      thenViolationsMention('MAJOR');
    });
  });

  describe('Scenario: MINOR bump adding subprocess is blocked (E3 variant)', () => {
    it('runs Given/When/Then', () => {
      givenPreviousVersionHasSubprocessDisabled('1.0.0');
      whenCheckingEscalationWithSubprocessEnabled('1.1.0');
      thenResultIsNotAllowed();
    });
  });

  describe('Scenario: MINOR bump adding filesystem.read is allowed (E5)', () => {
    it('runs Given/When/Then', () => {
      givenPreviousVersionHasNoFilesystemRead('1.0.0');
      whenCheckingEscalationWithFilesystemReadAdded('1.1.0');
      thenResultIsAllowed();
    });
  });

  // ── PATCH bump rules (C3) ──────────────────────────────────────────

  describe('Scenario: PATCH bump with any new permission is blocked (E3, E4)', () => {
    it('runs Given/When/Then', () => {
      givenPreviousVersionHasNoPermissions('1.0.0');
      whenCheckingEscalationWithNetworkOutboundAdded('1.0.1');
      thenResultIsNotAllowed();
      thenViolationsMention('PATCH');
    });
  });

  describe('Scenario: PATCH bump adding filesystem.write is blocked (E4)', () => {
    it('runs Given/When/Then', () => {
      givenPreviousVersionHasNoFilesystemWrite('1.0.0');
      whenCheckingEscalationWithFilesystemWriteAdded('1.0.1');
      thenResultIsNotAllowed();
    });
  });

  // ── No escalation (C3 negative) ────────────────────────────────────

  describe('Scenario: PATCH bump with no permission changes is allowed (E6)', () => {
    it('runs Given/When/Then', () => {
      givenPreviousVersionHasNetworkOutbound('1.0.0', 'api.example.com');
      whenCheckingEscalationWithSamePermissions('1.0.1', 'api.example.com');
      thenResultIsAllowed();
    });
  });

  // ── Removing permissions (C5) ──────────────────────────────────────

  describe('Scenario: Removing permissions is always allowed (E7)', () => {
    it('runs Given/When/Then', () => {
      givenPreviousVersionHasNetworkOutbound('1.0.0', 'api.example.com');
      whenCheckingEscalationWithNetworkOutboundRemoved('1.0.1');
      thenResultIsAllowed();
    });
  });

  // ── First publish (C4) ─────────────────────────────────────────────

  describe('Scenario: First publish with no previous version is always allowed (E8)', () => {
    it('runs Given/When/Then', () => {
      whenCheckingEscalationWithNoPreviousVersion({ network: { outbound: ['api.example.com'] } });
      thenResultIsAllowed();
    });
  });
});
