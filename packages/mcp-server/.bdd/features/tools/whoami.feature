Feature: Whoami Tool
  As an AI agent using Tank MCP
  I want to check who I'm authenticated as
  So I can verify my identity before performing operations

  @auth
  Scenario: Authenticated user checks identity
    Given I am authenticated with Tank
    When I call the "whoami" tool
    Then the response should contain my user name
    And the response should contain my email address

  @auth
  Scenario: Unauthenticated user checks identity
    Given I am not authenticated with Tank
    When I call the "whoami" tool
    Then I should see a message to log in first

  @auth
  Scenario: Expired token shows appropriate message
    Given I have an expired Tank token
    When I call the "whoami" tool
    Then I should see a message that my session has expired
