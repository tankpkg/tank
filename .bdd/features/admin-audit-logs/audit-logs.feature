# Intent: .idd/modules/admin-audit-logs/INTENT.md
# Layer: Constraints (C1–C6), Examples (E1–E5)

@admin-audit-logs
@real-db
Feature: Admin audit log access
  As a Tank administrator
  I need to query the audit event log with filters and pagination
  So that I can trace security-sensitive actions and investigate incidents

  Background:
    Given I am authenticated as an admin

  # ── Auth enforcement (C1) ─────────────────────────────────────────────
  @high
  Scenario: GET /admin/audit-logs as non-admin returns 401 (E2)
    Given I am not authenticated
    When I call GET /api/admin/audit-logs
    Then the response is 401

  # ── List events (C4, C5, C6) ──────────────────────────────────────────
  @high
  Scenario: GET /admin/audit-logs returns paginated events (E1)
    When I call GET /api/admin/audit-logs
    Then the response is 200
    And the response contains "events"
    And the response contains "total"
    And the response contains "totalPages"

  # ── Actor join (C4) ────────────────────────────────────────────────────
  @medium
  Scenario: Events include actorName and actorEmail (E5)
    Given an audit event exists for the current admin user
    When I call GET /api/admin/audit-logs?actorId={adminUserId}
    Then at least one event has "actorName" or "actorEmail"

  # ── Date filter validation (C3) ───────────────────────────────────────
  @high
  Scenario: Invalid startDate returns 400 (E4)
    When I call GET /api/admin/audit-logs?startDate=not-a-date
    Then the response is 400
    And the error message contains "Invalid startDate"

  # ── Action filter (C2) ────────────────────────────────────────────────
  @medium
  Scenario: Filter by action returns only matching events (E3)
    When I call GET /api/admin/audit-logs?action=rescan
    Then all returned events have action "rescan"
