# Intent: idd/modules/dashboard/INTENT.md

@tanstack
@dashboard
@auth-required
Feature: Dashboard API token management on TanStack
  As an authenticated user
  I need to manage my API tokens
  So that I can publish skills and access private packages

  Scenario: Dashboard shows existing API tokens
    Given I am logged in
    When I visit the dashboard page
    Then I see a list of my API tokens

  Scenario: User can create a new API token
    Given I am logged in
    When I visit the dashboard page
    And I create a new API token
    Then I see the new token value displayed once
