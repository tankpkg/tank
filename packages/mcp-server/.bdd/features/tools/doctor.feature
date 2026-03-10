Feature: Doctor Tool
  As an AI agent using Tank MCP
  I want to diagnose my Tank setup
  So I can identify and fix configuration issues

  Scenario: Doctor reports healthy setup
    Given I am authenticated with Tank
    And I have a valid skills.json in the current directory
    When I call the "doctor" tool
    Then the response should show a health summary
    And it should report detected AI agents
    And it should report authentication status

  Scenario: Doctor reports missing config
    Given I am not authenticated with Tank
    When I call the "doctor" tool
    Then the response should indicate I am not logged in
    And it should suggest running login

  Scenario: Doctor reports no skills.json
    Given I am authenticated with Tank
    And I am in a directory without skills.json
    When I call the "doctor" tool
    Then the response should note no skills.json found
