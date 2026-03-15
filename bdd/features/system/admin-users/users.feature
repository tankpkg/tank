# Intent: idd/modules/admin-users/INTENT.md
# Layer: Constraints (C1–C6), Examples (E1–E6)

@admin-users
@real-db
Feature: Admin user management
  As a Tank administrator
  I need to list, search, filter, and manage user accounts
  So that I can moderate the registry and respond to policy violations

  Background:
    Given I am authenticated as an admin

  # ── Auth enforcement (C1) ─────────────────────────────────────────────
  @high
  Scenario: GET /admin/users as non-admin returns 401 (E2)
    Given I am not authenticated
    When I call GET /api/admin/users
    Then the response is 401

  # ── List users (C2, C5) ───────────────────────────────────────────────
  @high
  Scenario: GET /admin/users returns paginated user list (E1)
    When I call GET /api/admin/users
    Then the response is 200
    And the response contains "users"
    And the response contains "total"
    And the response contains "totalPages"

  # ── Search filter (C3) ────────────────────────────────────────────────
  @medium
  Scenario: Search by partial email filters results (E3)
    Given a test user with email "bdd-user-filter-test@tank.test" exists
    When I call GET /api/admin/users?search=bdd-user-filter-test
    Then the response contains that user
    And other users are excluded

  # ── Role filter (C2) ─────────────────────────────────────────────────
  @medium
  Scenario: Filter by role=admin returns only admin users (E4)
    When I call GET /api/admin/users?role=admin
    Then all returned users have role "admin"

  # ── Status filter via user_status table (C4) ──────────────────────────
  @medium
  Scenario: Filter by status=suspended returns only suspended users (E5)
    Given a test user with suspended status exists
    When I call GET /api/admin/users?status=suspended
    Then only suspended users are returned
