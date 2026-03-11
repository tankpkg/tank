# Intent: .idd/modules/web-publish/INTENT.md
# Layer: Constraints (C1–C10), Examples (E1–E8)

@web-publish
@real-db
Feature: Publish API — 3-step HTTP publish flow
  As an authenticated CLI or service account
  I need the registry API to validate, store, and confirm skill versions
  So that published skills are safe, well-formed, and traceable

  Background:
    Given I am authenticated as a member of the test org

  # ── Auth enforcement (C1) ─────────────────────────────────────────────
  @high
  Scenario: POST /skills without auth returns 401 (E2)
    Given no Authorization header is set
    When I POST to /api/v1/skills with a valid manifest
    Then the response is 401

  # ── Manifest validation (C3) ─────────────────────────────────────────
  @high
  Scenario: POST /skills with invalid manifest returns 400 (E3)
    When I POST to /api/v1/skills with a manifest missing the "version" field
    Then the response is 400
    And the response includes "fieldErrors"

  # ── Org not found (C4) ────────────────────────────────────────────────
  @high
  Scenario: POST /skills with nonexistent org returns 404 (E4)
    When I POST to /api/v1/skills with skill name "@nonexistent-bdd-org/skill"
    Then the response is 404
    And the error message contains "Organization"

  # ── Version conflict (C6) ─────────────────────────────────────────────
  @high
  Scenario: POST /skills for already-existing version returns 409 (E5)
    Given skill "@{testOrg}/publish-api-conflict" version "1.0.0" already exists
    When I POST to /api/v1/skills for "@{testOrg}/publish-api-conflict" version "1.0.0"
    Then the response is 409

  # ── Permission escalation at API level (C7) ──────────────────────────
  @high
  Scenario: PATCH bump with new network permission returns 400 with violations (E6)
    Given skill "@{testOrg}/publish-api-escalation" version "1.0.0" exists without network permissions
    When I POST to /api/v1/skills for version "1.0.1" with network.outbound added
    Then the response is 400
    And the response includes "violations"

  # ── Successful initiation returns uploadUrl (C8) ──────────────────────
  @high
  Scenario: Valid POST /skills returns uploadUrl, skillId, versionId (E1)
    When I POST to /api/v1/skills with a valid manifest for "@{testOrg}/publish-api-new" version "1.0.0"
    Then the response is 200
    And the response contains "uploadUrl"
    And the response contains "skillId"
    And the response contains "versionId"

  # ── Confirm lifecycle (C9, C10) ───────────────────────────────────────
  @high
  Scenario: POST /confirm with valid versionId returns success (E7)
    Given a version record in "pending-upload" status exists
    When I POST to /api/v1/skills/confirm with that versionId and integrity
    Then the response is 200
    And the response includes "success: true"

  @medium
  Scenario: POST /confirm with already-confirmed versionId returns 400 (E8)
    Given a version record in "completed" status exists
    When I POST to /api/v1/skills/confirm with that versionId
    Then the response is 400
