# Intent: idd/modules/web-publish/INTENT.md
# Layer: Constraints (C1, C1a-C1d), Examples (E1a-E1c, E3)
#
# This feature exercises the scope-based authorization path on /api/v1/skills.
# The legacy publish-api.feature uses an unscoped (legacy) API key and therefore
# does NOT cover this surface. This file fills that gap.
#
# Bug context (2026-04-28): Users report that all newly-issued CI/CD tokens with
# explicit publish scopes fail `tank publish` with 401 (CLI surfaces a misleading
# "Authentication failed. Run: tank login" message), even though `tank whoami`
# succeeds. The intent is unambiguous: scoped tokens with skills:publish MUST
# authenticate; tokens without it MUST get 403 — never 401.

@web-publish
@token-scopes
@real-db
Feature: Publish API — scope-based authorization for API tokens
  As a CLI user or CI/CD pipeline using a scoped API token
  I need /api/v1/skills to honor my token's permissions correctly
  So that scoped publish tokens actually let me publish, and missing-scope
  tokens are rejected with the right status code

  # ── Positive: skills:publish scope authenticates (C1a, E1a) ─────────────
  @high
  @bug-2026-04-28
  Scenario: API key with skills:publish scope can publish (E1a)
    Given I have an API key whose permissions JSON is '{"skills":["publish"]}'
    When I POST to /api/v1/skills with that key and a valid manifest
    Then the response status is 200
    And the response body contains "uploadUrl"
    And the response body contains "skillId"
    And the response body contains "versionId"

  # ── Positive: skills:admin scope authenticates (C1b, E1b) ───────────────
  @high
  Scenario: API key with skills:admin scope can publish (E1b)
    Given I have an API key whose permissions JSON is '{"skills":["admin"]}'
    When I POST to /api/v1/skills with that key and a valid manifest
    Then the response status is 200
    And the response body contains "uploadUrl"

  # ── Positive: legacy unscoped key still works (C1c, E1c) ────────────────
  @high
  Scenario: Legacy API key with NULL permissions still authenticates (E1c)
    Given I have an API key whose permissions JSON is NULL
    When I POST to /api/v1/skills with that key and a valid manifest
    Then the response status is 200
    And the response body contains "uploadUrl"

  # ── Negative: missing publish scope returns 403, not 401 (C1d, E3) ──────
  @high
  @bug-2026-04-28
  Scenario: API key without publish or admin scope is rejected with 403 (E3)
    Given I have an API key whose permissions JSON is '{"skills":["read"]}'
    When I POST to /api/v1/skills with that key and a valid manifest
    Then the response status is 403
    And the response status is not 401
