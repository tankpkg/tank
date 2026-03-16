# Intent: .idd/modules/open-reads/INTENT.md
# Layer: Constraints (C1–C8), Examples (E1–E9)

@open-reads
@real-db
Feature: Open-reads mode for on-prem registries
  As a developer on a corporate network
  I want to install and search skills without authentication
  So that the VPN is my access control and I don't need individual accounts

  # ── Unauthenticated skill metadata (C1, C2) ────────────────────────────
  @high
  Scenario: Skill metadata returned without auth in open-reads mode (E1)
    Given AUTH_MODE is set to "open-reads"
    And a skill "@org/internal-tool" exists with visibility "private"
    When I GET /api/v1/skills/@org/internal-tool without an Authorization header
    Then the response is 200
    And the response contains the skill's full metadata

  # ── Standard mode preserves visibility (C4) ────────────────────────────
  @high
  Scenario: Private skill hidden without auth in standard mode (E2)
    Given AUTH_MODE is set to "standard"
    And a skill "@org/internal-tool" exists with visibility "private"
    When I GET /api/v1/skills/@org/internal-tool without an Authorization header
    Then the response is 404

  # ── Unauthenticated search includes private skills (C7) ────────────────
  @high
  Scenario: Search returns private skills in open-reads mode (E3)
    Given AUTH_MODE is set to "open-reads"
    And a private skill "@org/secret-sauce" exists
    When I GET /api/v1/search?q=secret without an Authorization header
    Then the response contains "@org/secret-sauce" in the results

  # ── Standard search hides private skills (C4) ─────────────────────────
  @high
  Scenario: Search hides private skills in standard mode (E4)
    Given AUTH_MODE is set to "standard"
    And a private skill "@org/secret-sauce" exists
    When I GET /api/v1/search?q=secret without an Authorization header
    Then the response does not contain "@org/secret-sauce"

  # ── Publish still requires auth (C3) ──────────────────────────────────
  @high
  Scenario: Publish rejected without auth even in open-reads mode (E5)
    Given AUTH_MODE is set to "open-reads"
    When I POST to /api/v1/skills without an Authorization header
    Then the response is 401

  # ── Publish works with auth (C3) ──────────────────────────────────────
  @high
  Scenario: Publish succeeds with valid token in open-reads mode (E6)
    Given AUTH_MODE is set to "open-reads"
    And I have a valid API token with skills:publish scope
    When I POST to /api/v1/skills with a valid Authorization header
    Then the response is 200

  # ── Download URL works without auth (C8) ──────────────────────────────
  @high
  Scenario: Version endpoint returns signed download URL without auth (E7)
    Given AUTH_MODE is set to "open-reads"
    And a skill "@org/tool" version "1.0.0" exists
    When I GET /api/v1/skills/@org/tool/1.0.0 without an Authorization header
    Then the response is 200
    And the response contains a valid "downloadUrl"

  # ── Invalid AUTH_MODE fallback (C5) ────────────────────────────────────
  @medium
  Scenario: Invalid AUTH_MODE value falls back to standard (E8)
    Given AUTH_MODE is set to "yolo"
    When the server processes a request
    Then it behaves as AUTH_MODE=standard
    And an error is logged about the invalid AUTH_MODE value

  # ── End-to-end CLI install (C1) ────────────────────────────────────────
  @high
  Scenario: CLI install works without login in open-reads mode (E9)
    Given AUTH_MODE is set to "open-reads"
    And a private skill "@org/internal-tool" version "1.0.0" exists
    And I am NOT logged in (no token in config)
    When I run "tank install @org/internal-tool"
    Then the install succeeds
    And the skill is extracted to the local skills directory
