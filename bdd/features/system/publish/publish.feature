# Intent: idd/modules/publish/INTENT.md
# Layer: Constraints (C1–C12), Examples (E1–E10)

@publish
@real-db
Feature: Skill publish via 3-step API flow
  As an authenticated skill author
  I need to pack and publish a skill package to the Tank registry
  So that other users can discover, install, and trust my skill

  # ── Authentication (C1) ──────────────────────────────────────────────
  @high
  Scenario: Unauthenticated publish attempt is rejected (E2)
    Given no auth token is configured
    When I attempt to publish a valid skill manifest
    Then the publish fails with "Not logged in"

  # ── Manifest validation (C2) ─────────────────────────────────────────
  @high
  Scenario: Invalid manifest missing version is rejected (E3)
    Given I am authenticated
    And a skill directory with a manifest missing the "version" field
    When I attempt to publish
    Then the API returns 400 with field errors

  # ── Name normalization (C3) ───────────────────────────────────────────
  @medium
  Scenario: Skill name is normalized to lowercase on publish
    Given I am authenticated as a member of org "TestOrg"
    When I publish a skill with name "@TestOrg/MySkill" version "1.0.0"
    Then the stored skill name is "@testorg/myskill"

  # ── Org membership enforcement (C4) ──────────────────────────────────
  @high
  Scenario: Publishing to a nonexistent org returns 404 (E4)
    Given I am authenticated
    When I attempt to publish "@nonexistent-org-bdd/skill" version "1.0.0"
    Then the API returns 404 with "Organization" in the error message

  # ── Version conflict (C5) ─────────────────────────────────────────────
  @high
  Scenario: Re-publishing an existing version returns 409 (E5)
    Given I am authenticated as a member of the test org
    And skill "@{testOrg}/conflict-test" version "1.0.0" already exists
    When I attempt to publish "@{testOrg}/conflict-test" version "1.0.0"
    Then the API returns 409 with "already exists"

  # ── Permission escalation (C6, C7, C8) ───────────────────────────────
  @high
  Scenario: PATCH bump adding network permission is rejected (E6)
    Given skill "@{testOrg}/escalation-test" version "1.0.0" exists without network permissions
    When I attempt to publish version "1.0.1" adding "network.outbound: ['api.example.com']"
    Then the API returns 400 with "Permission escalation" in the error

  @high
  Scenario: MAJOR bump adding network permission is allowed (E7)
    Given skill "@{testOrg}/escalation-major" version "1.0.0" exists without network permissions
    When I publish version "2.0.0" adding "network.outbound: ['api.example.com']"
    Then the publish initiation succeeds with 200

  # ── Dry run (C9) ──────────────────────────────────────────────────────
  @medium
  Scenario: Dry run does not create a version record (E8)
    Given I am authenticated as a member of the test org
    When I publish with "--dry-run" flag for "@{testOrg}/dry-run-skill" version "9.9.9"
    Then no version record is created for "@{testOrg}/dry-run-skill" version "9.9.9"

  # ── Double confirm guard (C11) ────────────────────────────────────────
  @medium
  Scenario: Confirming an already-confirmed version returns 400 (E10)
    Given a version record with status "completed" exists
    When I POST to /api/v1/skills/confirm with that versionId
    Then the API returns 400 with "already confirmed"
