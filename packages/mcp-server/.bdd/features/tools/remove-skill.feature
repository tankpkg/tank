Feature: Remove Skill Tool
  As an AI agent using Tank MCP
  I want to remove installed skills
  So I can clean up skills I no longer need

  Scenario: Remove an installed skill
    Given I have a project with "@test/hello-world" installed
    When I call the "remove-skill" tool with:
      | name | @test/hello-world |
    Then the response should confirm removal
    And the skill should be removed from skills.lock
    And the skill files should be deleted from .tank/skills/

  Scenario: Remove a skill that is not installed
    Given I have a consumer project directory
    When I call the "remove-skill" tool with:
      | name | @test/not-installed |
    Then the response should indicate skill is not installed

  Scenario: Remove requires a skill name
    Given I have a consumer project directory
    When I call the "remove-skill" tool with no arguments
    Then the response should indicate a skill name is required
