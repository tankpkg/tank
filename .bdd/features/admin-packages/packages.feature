# Intent: .idd/modules/admin-packages/INTENT.md
# Layer: Constraints (C1–C5), Examples (E1–E5)

@admin-packages
@real-db
Feature: Admin package catalog management
  As a Tank administrator
  I need to list, search, filter, and moderate skill packages
  So that I can respond to security incidents and enforce registry policies

  Background:
    Given I am authenticated as an admin

  # ── Auth enforcement (C1) ─────────────────────────────────────────────
  @high
  Scenario: GET /admin/packages as non-admin returns 401
    Given I am not authenticated
    When I call GET /api/admin/packages
    Then the response is 401

  # ── List packages (C2, C4) ────────────────────────────────────────────
  @high
  Scenario: GET /admin/packages returns paginated package list with publisher info (E1)
    When I call GET /api/admin/packages
    Then the response is 200
    And the response contains "packages"
    And each package includes "publisher" with name and email

  # ── Search filter (C2) ────────────────────────────────────────────────
  @medium
  Scenario: Search by name filters results (E4)
    Given a skill "@{testOrg}/admin-pkg-search-target" exists
    When I call GET /api/admin/packages?search=admin-pkg-search-target
    Then the response contains that package

  # ── Status filter validation (C3) ────────────────────────────────────
  @high
  Scenario: Invalid status filter returns 400 (E3)
    When I call GET /api/admin/packages?status=invalid-status
    Then the response is 400
    And the error message mentions valid status values

  # ── Featured filter (C2) ─────────────────────────────────────────────
  @medium
  Scenario: Filter by featured=true returns only featured packages
    When I call GET /api/admin/packages?featured=true
    Then all returned packages have featured set to true
