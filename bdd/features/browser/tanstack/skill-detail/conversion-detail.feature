# Intent: idd/modules/conversion-skill-detail/INTENT.md

@skill-detail
@conversion
Feature: Skill detail conversion improvements
  As a visitor evaluating a package
  I need to see the install command and trust signals immediately
  So that I can decide to install without hunting for information

  Background:
    Given a public skill has been published

  # ── Desktop install command ──────────────────────────────────

  @conversion
  @install
  Scenario: Install command is visible on desktop
    When I visit the skill detail page on desktop
    Then I see a copyable install command in the page header
    And the install command starts with "tank install"

  @conversion
  @install
  Scenario: Install command copy works on desktop
    When I visit the skill detail page on desktop
    And I click the copy button next to the install command
    Then the command is copied to clipboard

  # ── Default tab ──────────────────────────────────────────────

  @conversion
  @tabs
  Scenario: README tab is default for scanned skills
    When I visit the skill detail page for a scanned skill
    Then the readme tab is active by default

  @conversion
  @tabs
  Scenario: README tab is default for unscanned skills
    When I visit the skill detail page for an unscanned skill
    Then the readme tab is active by default

  # ── Trust summary card ───────────────────────────────────────

  @conversion
  @trust
  Scenario: Trust summary card appears above tabs when scan data exists
    When I visit the skill detail page for a scanned skill
    Then I see a trust summary card above the content tabs
    And the trust summary shows the scan verdict
    And there is visible spacing between the trust summary and the tabs

  @conversion
  @trust
  Scenario: Trust summary "View details" activates security tab
    When I visit the skill detail page for a scanned skill
    And I click "View details" in the trust summary
    Then the security tab is active

  @conversion
  @trust
  Scenario: Trust summary card does not appear without scan data
    When I visit the skill detail page for an unscanned skill
    Then the trust summary card is not shown
