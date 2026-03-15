# Intent: idd/modules/admin-bulk-rescan/INTENT.md
# Layer: Constraints (C1–C4), Examples (E1–E3)

@admin-bulk-rescan
@real-db
Feature: Admin bulk rescan of skill versions
  As a Tank administrator
  I need to trigger a bulk re-scan of skill versions
  So that updated scanner capabilities are applied to existing packages

  Background:
    Given I am authenticated as an admin

  # ── Auth enforcement (C1) ─────────────────────────────────────────────
  @high
  Scenario: POST /admin/rescan-skills as non-admin returns 401 (E2)
    Given I am not authenticated
    When I POST to /api/admin/rescan-skills
    Then the response is 401

  # ── Bulk rescan (C3) ─────────────────────────────────────────────────
  @high
  Scenario: POST /admin/rescan-skills returns count of queued versions (E1)
    When I POST to /api/admin/rescan-skills
    Then the response is 200
    And the response contains a "queued" count (number)
