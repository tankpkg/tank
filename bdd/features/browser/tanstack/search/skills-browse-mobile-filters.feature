# Intent: idd/modules/skills-browse-mobile/INTENT.md

@tanstack
@search
@responsive
Feature: Skills browse page — mobile filter bar
  As a developer browsing skills on a phone
  I need compact inline filters instead of a full sidebar
  So that skill cards are immediately visible without scrolling past filter groups

  Scenario: Mobile shows horizontal filter bar instead of sidebar
    When I open the skills browse page on a mobile viewport
    Then the mobile filter bar should be visible
    And the desktop filter sidebar should be hidden
    And the skills grid should be visible

  Scenario: Desktop shows sidebar instead of mobile filter bar
    When I open the skills browse page on a desktop viewport
    Then the desktop filter sidebar should be visible
    And the mobile filter bar should be hidden

  Scenario: Mobile filter bar contains select dropdowns for each filter
    When I open the skills browse page on a mobile viewport
    Then the mobile filter bar should contain a "Score" filter
    And the mobile filter bar should contain a "Freshness" filter
    And the mobile filter bar should contain a "Popularity" filter

  Scenario: Selecting a mobile filter navigates with URL params
    When I open the skills browse page on a mobile viewport
    And I select "High (7+)" from the "Score" mobile filter
    Then the URL should contain "score=high"
    And the skills grid should be visible

  Scenario: Active mobile filter shows current value
    When I open the skills browse page on a mobile viewport with score=high
    Then the "Score" mobile filter should show "High (7+)"

  Scenario: Mobile filter bar is horizontally scrollable
    When I open the skills browse page on a mobile viewport
    Then the mobile filter bar should have horizontal scroll

  Scenario: No horizontal page overflow on mobile browse
    When I open the skills browse page on a mobile viewport
    Then the page should not have horizontal overflow
