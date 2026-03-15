@tanstack
@navigation
Feature: TanStack responsive registry header
  TanStack ships a target-specific responsive header contract with desktop nav,
  search trigger, and a mobile menu toggle.

  Scenario: Desktop header shows desktop navigation controls
    When I open the homepage on a desktop viewport
    Then the desktop navigation should be visible
    And the search trigger should be visible
    And the mobile menu toggle should be hidden

  Scenario: Mobile header collapses to a menu toggle
    When I open the homepage on a mobile viewport
    Then the mobile menu toggle should be visible
    And the desktop navigation should be hidden
    And the search trigger should be hidden
