# Intent: .idd/modules/star/INTENT.md
# Layer: Constraints (C1–C6), Examples (E1–E6)

@star
@real-db
Feature: Skill starring and unstarring
  As a registered user
  I need to star and unstar skills
  So that I can bookmark favorites and signal quality to other users

  Background:
    Given a public skill "@{testOrg}/star-test-skill" exists in the registry

  # ── Read star count (C1) ──────────────────────────────────────────────
  @high
  Scenario: GET /star returns count and isStarred for unauthenticated user (E1)
    When I call GET /api/v1/skills/@{testOrg}/star-test-skill/star without auth
    Then the response is 200
    And the response contains "starCount"
    And "isStarred" is false

  # ── Star a skill (C2) ─────────────────────────────────────────────────
  @high
  Scenario: POST /star authenticated adds a star (E2)
    Given I am authenticated
    When I POST to /api/v1/skills/@{testOrg}/star-test-skill/star
    Then the response is 200
    And "starCount" is 1
    And "isStarred" is true

  # ── Idempotent star (C3) ──────────────────────────────────────────────
  @medium
  Scenario: Starring an already-starred skill is idempotent (E3)
    Given I am authenticated and have already starred "@{testOrg}/star-test-skill"
    When I POST to /api/v1/skills/@{testOrg}/star-test-skill/star again
    Then the response contains "Already starred"

  # ── Unstar (C4) ───────────────────────────────────────────────────────
  @high
  Scenario: DELETE /star removes the star (E4)
    Given I am authenticated and have starred "@{testOrg}/star-test-skill"
    When I DELETE /api/v1/skills/@{testOrg}/star-test-skill/star
    Then the response is 200
    And "isStarred" is false

  # ── Auth required for write (C2) ─────────────────────────────────────
  @high
  Scenario: POST /star without auth returns 401 (E5)
    When I POST to /api/v1/skills/@{testOrg}/star-test-skill/star without auth
    Then the response is 401

  # ── 404 for nonexistent skill (C5) ────────────────────────────────────
  @medium
  Scenario: GET /star for nonexistent skill returns 404 (E6)
    When I call GET /api/v1/skills/@{testOrg}/nonexistent-star-skill/star
    Then the response is 404
