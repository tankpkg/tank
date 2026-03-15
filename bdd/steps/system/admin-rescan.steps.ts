// Intent: idd/modules/admin-rescan-version/INTENT.md
// Feature: bdd/features/system/admin/rescan-version.feature

import { describe, it } from 'vitest';

// ── Feature: Admin rescan a specific package version ────────────────────────

describe('Feature: Admin rescan a specific package version', () => {
  // ── Scenario: Rescan requires admin authentication (C1, E2) ─────────────

  describe('Scenario: Rescan requires admin authentication', () => {
    it.todo('When an unauthenticated request triggers a rescan');
    it.todo('Then the response is 401');
  });

  // ── Scenario: Non-admin users are rejected (C2, E3) ────────────────────

  describe('Scenario: Non-admin users are rejected with 403', () => {
    it.todo('Given a regular (non-admin) user is authenticated');
    it.todo('When the user triggers a rescan');
    it.todo('Then the response is 403');
  });

  // ── Scenario: Rescan returns 404 for non-existent package (C3, E4) ─────

  describe('Scenario: Rescan returns 404 for non-existent package', () => {
    it.todo('Given an admin user exists with a valid session');
    it.todo('When the admin triggers a rescan for a non-existent package');
    it.todo('Then the response is 404');
  });

  // ── Scenario: Rescan returns 404 for non-existent version (C3) ─────────

  describe('Scenario: Rescan returns 404 for non-existent version', () => {
    it.todo('Given an admin user exists with a valid session');
    it.todo('And a published package exists');
    it.todo('When the admin triggers a rescan for a non-existent version');
    it.todo('Then the response is 404');
  });

  // ── Scenario: Successfully rescan a version (C4, C5, E1) ──────────────

  describe('Scenario: Successfully rescan a version updates audit status', () => {
    it.todo('Given an admin user exists with a valid session');
    it.todo('And a published package exists with a version');
    it.todo('When the admin triggers a rescan');
    it.todo('Then the response is 200');
    it.todo('And the response contains a status field');
    it.todo('And the version audit status is no longer pending');
  });

  // ── Scenario: URL-encoded scoped package names (C6, E5) ───────────────

  describe('Scenario: URL-encoded scoped package names are handled correctly', () => {
    it.todo('Given an admin user exists with a valid session');
    it.todo('And a published scoped package exists');
    it.todo('When the admin triggers a rescan for the scoped package');
    it.todo('Then the response is 200');
    it.todo('And no routing errors occur from the encoded slash');
  });
});
