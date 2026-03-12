# Intent: .idd/modules/trust-badge/INTENT.md
# Layer: Examples (all rows)

@trust-badge
@real-db
Feature: Trust Badge Display
  As a skill consumer
  I need to see the security status at a glance
  So that I can quickly assess trustworthiness

  Background:
    Given I am on the skills browse page

  # ── Verified badge (C1) ─────────────────────────────────────────────
  @high
  Scenario: Skill with PASS verdict and 0 findings shows verified badge
    Given a public skill "@{testOrg}/verified-skill" exists with verdict "pass" and 0 findings
    When I visit the skills browse page
    Then I see a green "Verified" badge for "@{testOrg}/verified-skill"

  # ── Review Recommended badge ───────────────────────────────────────
  @high
  Scenario: Skill with PASS_WITH_NOTES shows review recommended badge
    Given a public skill "@{testOrg}/review-skill" exists with verdict "pass_with_notes" and 2 medium findings
    When I visit the skills browse page
    Then I see a yellow "Review Recommended" badge for "@{testOrg}/review-skill"

  # ── Concerns badge ──────────────────────────────────────────────────
  @high
  Scenario: Skill with FLAGGED verdict shows concerns badge
    Given a public skill "@{testOrg}/flagged-skill" exists with verdict "flagged"
    When I visit the skills browse page
    Then I see an orange "Concerns" badge for "@{testOrg}/flagged-skill"

  # ── Unsafe badge ─────────────────────────────────────────────────────
  @high
  Scenario: Skill with FAIL verdict shows unsafe badge
    Given a public skill "@{testOrg}/unsafe-skill" exists with verdict "fail"
    When I visit the skills browse page
    Then I see a red "Unsafe" badge for "@{testOrg}/unsafe-skill"

  # ── Pending badge (C1) ───────────────────────────────────────────────
  @high
  Scenario: Skill not yet scanned shows pending badge
    Given a public skill "@{testOrg}/pending-skill" exists with no scan results
    When I visit the skills browse page
    Then I see a gray "Pending" badge for "@{testOrg}/pending-skill"

  # ── Most Secure sort (C4) ────────────────────────────────────────────
  @medium
  Scenario: Sort by Most Secure prioritizes verified skills
    Given a public skill "@{testOrg}/zzz-verified" exists with verdict "pass" and 0 findings
    And a public skill "@{testOrg}/aaa-pending" exists with no scan results
    When I sort skills by "Most Secure"
    Then "@{testOrg}/zzz-verified" appears before "@{testOrg}/aaa-pending"

  # ── Quality checks (C3) ───────────────────────────────────────────────
  @medium
  Scenario: Skill detail page shows quality checks
    Given a public skill "@{testOrg}/quality-skill" exists with README, description, and permissions
    When I visit the skill detail page for "@{testOrg}/quality-skill"
    Then I see quality checks for "Documentation", "Package Hygiene", and "Permissions"

  # ── Badge API (C2) ─────────────────────────────────────────────────────
  @medium
  Scenario: Badge API returns trust level SVG
    Given a public skill "@{testOrg}/badge-skill" exists with verdict "pass" and 0 findings
    When I call GET /api/v1/badge/@{testOrg}/badge-skill
    Then the response is 200
    And the SVG contains "verified"
