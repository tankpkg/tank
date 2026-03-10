Feature: Logout Tool
  As an AI agent using Tank MCP
  I want to log out of Tank
  So I can clear my credentials

  @auth
  Scenario: Authenticated user logs out
    Given I am authenticated with Tank
    When I call the "logout" tool
    Then the response should confirm logout
    And my credentials should be cleared from config

  @auth
  Scenario: Already logged out user tries to log out
    Given I am not authenticated with Tank
    When I call the "logout" tool
    Then the response should indicate I was not logged in
