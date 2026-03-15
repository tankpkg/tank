# Intent: idd/modules/web-registry/INTENT.md

@tanstack
@skill-detail
Feature: Skill detail page on TanStack
  As a visitor browsing the registry
  I need to see complete skill information
  So that I can evaluate whether to install a skill

  Background:
    Given a public skill has been published

  Scenario: Skill page displays name and description
    When I visit the skill detail page
    Then I see the skill name
    And I see the skill description

  Scenario: Skill page shows audit score
    When I visit the skill detail page
    Then I see the audit score badge

  Scenario: Skill page shows version information
    When I visit the skill detail page
    Then I see the current version number
