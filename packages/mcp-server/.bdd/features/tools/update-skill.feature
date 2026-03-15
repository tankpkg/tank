Feature: Update Skill Tool
  As an AI agent using Tank MCP
  I want to update installed skills to newer versions
  So I can get the latest features and security fixes

  @auth
  @network
  Scenario: Update a specific installed skill
    Given I am authenticated with Tank
    And I have a project with "@test/hello-world@1.0.0" installed
    When I call the "update-skill" tool with:
      | name | @test/hello-world |
    Then the response should indicate the update result

  @auth
  @network
  Scenario: Update all installed skills
    Given I am authenticated with Tank
    And I have a project with installed skills
    When I call the "update-skill" tool with no arguments
    Then the response should show update status for all skills

  @auth
  Scenario: Update fails without authentication
    Given I am not authenticated with Tank
    When I call the "update-skill" tool with:
      | name | @test/hello-world |
    Then I should see a message to log in first

  Scenario: Update with no skills installed
    Given I am authenticated with Tank
    And I have a consumer project with no installed skills
    When I call the "update-skill" tool with no arguments
    Then the response should indicate no skills to update
