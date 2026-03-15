# Intent: idd/modules/login/INTENT.md
# Browser-specific constraints for TanStack login UI

@tanstack
@login
Feature: Login page renders correctly on TanStack
  As a visitor
  I need to see authentication options
  So that I can sign in and access protected features

  Scenario: Login page shows email and password fields
    When I visit the login page
    Then I see an email input field
    And I see a password input field

  Scenario: Login page shows social authentication options
    When I visit the login page
    Then I see a GitHub sign-in option

  Scenario: Unauthenticated user is redirected from dashboard to login
    When I visit the dashboard page without being authenticated
    Then I am redirected to the login page
