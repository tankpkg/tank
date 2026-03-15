# Intent: idd/modules/admin-orgs/INTENT.md
# Layer: Constraints (C1–C4), Examples (E1–E4)

@admin-orgs
@real-db
Feature: Admin organization management
  As a Tank administrator
  I need to list and manage organizations and their memberships
  So that I can control namespace integrity and respond to abuse

  Background:
    Given I am authenticated as an admin

  # ── Auth enforcement (C1) ─────────────────────────────────────────────
  @high
  Scenario: GET /admin/orgs as non-admin returns 401 (E2)
    Given I am not authenticated
    When I call GET /api/admin/orgs
    Then the response is 401

  # ── List orgs (C2) ────────────────────────────────────────────────────
  @high
  Scenario: GET /admin/orgs returns paginated org list (E1)
    When I call GET /api/admin/orgs
    Then the response is 200
    And the response contains a list of organizations

  # ── Org detail (C3) ───────────────────────────────────────────────────
  @medium
  Scenario: GET /admin/orgs/[id] returns org detail with members (E3)
    Given a test org with members exists
    When I call GET /api/admin/orgs/{testOrgId}
    Then the response is 200
    And the response includes member information
