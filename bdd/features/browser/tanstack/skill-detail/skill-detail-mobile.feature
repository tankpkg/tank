# Intent: idd/modules/skill-detail-mobile/INTENT.md

@tanstack
@skill-detail
@responsive
Feature: Skill detail page — mobile responsiveness
  As a developer browsing skills on a phone
  I need the skill detail page to adapt to narrow viewports
  So that I can evaluate skills without horizontal overflow or unreadable content

  Background:
    Given a public skill has been published

  Scenario: Mobile shows compact action bar instead of sidebar
    When I visit the skill detail page on a mobile viewport
    Then the mobile action bar should be visible
    And the mobile action bar should contain a star button
    And the mobile action bar should contain an install command
    And the desktop sidebar should be hidden

  Scenario: Desktop shows sidebar instead of compact action bar
    When I visit the skill detail page on a desktop viewport
    Then the desktop sidebar should be visible
    And the mobile action bar should be hidden

  Scenario: Mobile Readme tab renders content full-width without sidebar
    When I visit the skill detail page on a mobile viewport
    Then the readme content should be visible
    And the desktop sidebar should be hidden

  Scenario: Mobile file explorer hides tree panel behind toggle
    When I visit the skill detail page on a mobile viewport
    And I click the "Files" tab
    Then the file tree toggle button should be visible
    And the desktop file tree panel should be hidden
    And the file editor area should be visible

  Scenario: Mobile file tree toggle opens and closes the tree panel
    When I visit the skill detail page on a mobile viewport
    And I click the "Files" tab
    And I click the file tree toggle button
    Then the mobile file tree panel should be visible
    When I click a file in the mobile tree panel
    Then the mobile file tree panel should be hidden

  Scenario: Mobile versions table scrolls horizontally
    When I visit the skill detail page on a mobile viewport
    And I click the "Versions" tab
    Then the versions table should be inside a scrollable container

  Scenario: Trigger badges collapse with show-more toggle
    Given the skill has more than 6 trigger phrases
    When I visit the skill detail page on a mobile viewport
    Then I should see at most 6 trigger badges
    And I should see a show-more button with the remaining count
    When I click the show-more button
    Then all trigger badges should be visible
    And I should see a show-less button

  Scenario: Mobile title uses smaller font size
    When I visit the skill detail page on a mobile viewport
    Then the skill title should be visible
    And the page should not have horizontal overflow
