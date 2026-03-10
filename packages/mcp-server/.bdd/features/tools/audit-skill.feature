Feature: Audit Skill Tool
  As an AI agent using Tank MCP
  I want to view the security audit results for installed skills
  So I can make informed decisions about skill safety

  @auth @network
  Scenario: Audit a specific installed skill
    Given I am authenticated with Tank
    And I have a project with "@test/hello-world" installed
    When I call the "audit-skill" tool with:
      | name | @test/hello-world |
    Then the response should show the audit score
    And it should show the scan verdict

  @auth @network
  Scenario: Audit all installed skills
    Given I am authenticated with Tank
    And I have a project with installed skills
    When I call the "audit-skill" tool with no arguments
    Then the response should show audit results for each skill

  @auth
  Scenario: Audit fails without authentication
    Given I am not authenticated with Tank
    When I call the "audit-skill" tool with:
      | name | @test/hello-world |
    Then I should see a message to log in first
