# Intent: .idd/modules/security-tab-simplification/INTENT.md
# Layer: Examples (all rows)

@security-tab-simplification
@real-db
Feature: Security Tab Simplification
  As a skill consumer
  I need to see security status without numeric scores
  So that I can quickly assess trustworthiness without confusion

  Background:
    Given I am on the skills browse page

  # ── No numeric score in list (C1) ──────────────────────────────────────
  @high
  Scenario: Skill list shows TrustBadge not numeric score
    Given a public skill "@{testOrg}/verified-skill" exists with verdict "pass" and 0 findings
    When I visit the skills browse page
    Then I see a "Verified" badge for "@{testOrg}/verified-skill"
    And I do NOT see "Score:" for "@{testOrg}/verified-skill"

  # ── No numeric score in security tab (C2) ──────────────────────────────
  @high
  Scenario: Security tab shows TrustBadge not 0-10 number
    Given a public skill "@{testOrg}/bulletproof" exists with verdict "pass" and 0 findings
    When I visit the skill detail page for "@{testOrg}/bulletproof"
    And I click the "Security" tab
    Then I see a "Verified" badge prominently
    And I do NOT see a large numeric score like "10" or "8"

  # ── Quality checks are pass/fail (C3) ───────────────────────────────────
  @high
  Scenario: Quality checks show pass/fail indicators not points
    Given a public skill "@{testOrg}/quality-skill" exists with README, description, and permissions
    When I visit the skill detail page for "@{testOrg}/quality-skill"
    And I click the "Security" tab
    Then I see quality checks with checkmark icons
    And I do NOT see points like "+1/1"

  # ── Four quality categories (C4) ────────────────────────────────────────
  @high
  Scenario: All four quality categories are shown
    Given a public skill "@{testOrg}/complete-skill" exists with README, description, license, repository, and permissions
    When I visit the skill detail page for "@{testOrg}/complete-skill"
    And I click the "Security" tab
    Then I see quality check for "Documentation"
    And I see quality check for "Package Hygiene"
    And I see quality check for "Permissions"
    And I see quality check for "Security Scan"

  # ── Verified skill with all checks passing ──────────────────────────────
  @high
  Scenario: Bulletproof skill shows all green checks
    Given a public skill "@{testOrg}/bulletproof" exists with verdict "pass", 0 findings, README, description, license, repository, and permissions
    When I visit the skill detail page for "@{testOrg}/bulletproof"
    And I click the "Security" tab
    Then I see a "Verified" badge
    And I see "Documentation" check passed
    And I see "Package Hygiene" check passed
    And I see "Permissions" check passed
    And I see "Security Scan" check passed
