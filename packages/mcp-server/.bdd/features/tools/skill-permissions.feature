Feature: Skill Permissions Tool
  As an AI agent using Tank MCP
  I want to view the permissions required by installed skills
  So I can understand what access my skills need

  Scenario: Display permissions for all installed skills
    Given I have a project with skills installed
    When I call the "skill-permissions" tool
    Then the response should list permissions grouped by category
    And it should show network, filesystem, and subprocess permissions

  Scenario: Display permissions for a specific skill
    Given I have a project with "@test/hello-world" installed
    When I call the "skill-permissions" tool with:
      | name | @test/hello-world |
    Then the response should show only that skill's permissions

  Scenario: No skills installed
    Given I have a consumer project with no installed skills
    When I call the "skill-permissions" tool
    Then the response should indicate no skills are installed
