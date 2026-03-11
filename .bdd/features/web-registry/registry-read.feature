# Intent: .idd/modules/web-registry/INTENT.md
# Layer: Constraints (C1–C6), Examples (E1–E5)

@web-registry
@real-db
Feature: Registry read API for skill metadata
  As a CLI agent, MCP tool, or web UI
  I need to read skill metadata via the registry API
  So that I can discover, verify, and install skills

  Background:
    Given a public skill "@{testOrg}/registry-read-skill" version "2.3.1" exists
    And a private skill "@{testOrg}/private-registry-skill" version "1.0.0" exists

  # ── Single skill metadata (C1, C2) ────────────────────────────────────
  @high
  Scenario: GET /skills/[name] returns metadata for a public skill (E1)
    When I call GET /api/v1/skills/@{testOrg}/registry-read-skill
    Then the response is 200
    And the response body includes "name", "description", "latestVersion", "publisher"

  @high
  Scenario: GET /skills/[name] returns 404 for unknown skill (E2)
    When I call GET /api/v1/skills/@{testOrg}/does-not-exist-zzz
    Then the response is 404

  # ── Private visibility enforcement (C5) ──────────────────────────────
  @high
  Scenario: Private skill is not visible to unauthenticated requests (E5)
    When I call GET /api/v1/skills/@{testOrg}/private-registry-skill without auth
    Then the response is 404

  # ── Version detail (C3) ───────────────────────────────────────────────
  @medium
  Scenario: GET /skills/[name]/[version] returns version detail (E3)
    When I call GET /api/v1/skills/@{testOrg}/registry-read-skill/2.3.1
    Then the response is 200
    And the response body includes "version"

  # ── Version list (C4) ─────────────────────────────────────────────────
  @medium
  Scenario: GET /skills/[name]/versions returns list of versions (E4)
    When I call GET /api/v1/skills/@{testOrg}/registry-read-skill/versions
    Then the response is 200
    And the response is an array

  # ── URL encoding (C6) ─────────────────────────────────────────────────
  @medium
  Scenario: Skill name with @ and / survives URL encoding in path
    When I call GET /api/v1/skills/%40{testOrg}%2Fregistry-read-skill
    Then the response is 200
    And the response "name" equals "@{testOrg}/registry-read-skill"
