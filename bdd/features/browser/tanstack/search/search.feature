# Intent: idd/modules/search/INTENT.md

@tanstack
@search
Feature: Skill search on TanStack registry
  As a visitor
  I need to search for skills
  So that I can find relevant tools for my project

  Background:
    Given public skills have been published

  Scenario: Skills page shows published skills
    When I visit the skills page
    Then I see a list of skills

  Scenario: Search bar filters skills by name
    When I visit the skills page
    And I type a skill name in the search bar
    Then I see matching skills in the results
