# Intent: .idd/modules/info/INTENT.md
# Layer: Constraints (C1–C6), Examples (E1–E5)

@info
@real-db
Feature: Skill info lookup via registry API
  As a CLI user or MCP tool
  I need to retrieve skill metadata including version, publisher, audit score, and permissions
  So that I can inspect a skill before installing it

  Background:
    Given a public skill "@{testOrg}/info-skill" version "1.0.0" exists in the registry
    And the skill has description "Test skill for info BDD"
    And the skill version has permissions: network outbound to "api.test.com"

  # ── Successful lookup (C2) ────────────────────────────────────────────
  @high
  Scenario: Fetching info for an existing skill returns metadata (E1)
    When I call GET /api/v1/skills/@{testOrg}/info-skill
    Then the response is 200
    And the response contains "name"
    And the response contains "latestVersion"
    And the response contains "publisher"

  # ── 404 for unknown skill (C1) ────────────────────────────────────────
  @high
  Scenario: Fetching info for a nonexistent skill returns 404 (E2)
    When I call GET /api/v1/skills/@{testOrg}/nonexistent-zzz
    Then the response is 404

  # ── Version detail with permissions (C3) ─────────────────────────────
  @medium
  Scenario: Fetching a version returns permissions and auditScore (E3)
    When I call GET /api/v1/skills/@{testOrg}/info-skill/1.0.0
    Then the response is 200
    And the response includes a "permissions" field

  # ── Private skill visibility (C3) ─────────────────────────────────────
  @high
  Scenario: Private skill is not visible to unauthenticated users (E4)
    Given a private skill "@{testOrg}/private-info-skill" version "1.0.0" exists
    When I call GET /api/v1/skills/@{testOrg}/private-info-skill without auth
    Then the response is 404
