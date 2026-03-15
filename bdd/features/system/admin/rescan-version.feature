# Intent: idd/modules/admin-rescan-version/INTENT.md
# Layer: Constraints (C1–C7), Examples (E1–E5)

@admin-rescan-version
@real-db
Feature: Admin rescan a specific package version
  As a registry administrator
  I want to trigger a security rescan for a specific package version
  So that I can re-evaluate packages after scanner improvements or scan failures

  Background:
    Given the Tank registry is running

  # ── Auth enforcement (C1) ──────────────────────────────────────────────
  @high
  Scenario: Rescan requires admin authentication (E2)
    When an unauthenticated request triggers a rescan for "@e2e/rescan-test" version "1.0.0"
    Then the response is 401

  # ── Role enforcement (C2) ──────────────────────────────────────────────
  @high
  Scenario: Non-admin users are rejected with 403 (E3)
    Given a regular (non-admin) user is authenticated
    When the user triggers a rescan for "@e2e/rescan-test" version "1.0.0"
    Then the response is 403

  # ── Nonexistent resource (C3) ──────────────────────────────────────────
  @high
  Scenario: Rescan returns 404 for non-existent package (E4)
    Given an admin user exists with a valid session
    When the admin triggers a rescan for "@e2e/nonexistent" version "1.0.0"
    Then the response is 404

  @high
  Scenario: Rescan returns 404 for non-existent version
    Given an admin user exists with a valid session
    And a published package "@e2e/rescan-test" exists with version "1.0.0"
    When the admin triggers a rescan for "@e2e/rescan-test" version "99.99.99"
    Then the response is 404

  # ── Successful rescan (C4, C5) ─────────────────────────────────────────
  @high
  Scenario: Successfully rescan a version updates audit status (E1)
    Given an admin user exists with a valid session
    And a published package "@e2e/rescan-test" exists with version "1.0.0"
    When the admin triggers a rescan for "@e2e/rescan-test" version "1.0.0"
    Then the response is 200
    And the response contains a status field
    And the version audit status is no longer "pending"

  # ── Scoped package names (C6) ──────────────────────────────────────────
  @medium
  Scenario: URL-encoded scoped package names are handled correctly (E5)
    Given an admin user exists with a valid session
    And a published scoped package "@org/skill" exists with version "1.0.0"
    When the admin triggers a rescan for "@org/skill" version "1.0.0"
    Then the response is 200
    And no routing errors occur from the encoded slash
