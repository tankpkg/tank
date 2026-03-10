Feature: Install Skill Tool
  As an AI agent using Tank MCP
  I want to install skills from the Tank registry
  So I can use them in my agent workspace

  @auth @network
  Scenario: Install a skill by name
    Given I am authenticated with Tank
    And I have a consumer project directory
    When I call the "install-skill" tool with:
      | name | @test/hello-world |
    Then the response should confirm installation
    And a skills.lock file should exist
    And the skill files should be extracted to .tank/skills/

  @auth @network
  Scenario: Install a skill with specific version
    Given I am authenticated with Tank
    And I have a consumer project directory
    When I call the "install-skill" tool with:
      | name    | @test/hello-world |
      | version | 1.0.0             |
    Then the response should confirm installation of version "1.0.0"

  @auth
  Scenario: Install fails without authentication
    Given I am not authenticated with Tank
    When I call the "install-skill" tool with:
      | name | @test/hello-world |
    Then I should see a message to log in first

  @auth @network
  Scenario: Install non-existent skill
    Given I am authenticated with Tank
    And I have a consumer project directory
    When I call the "install-skill" tool with:
      | name | @test/does-not-exist-xyz |
    Then the response should indicate skill not found

  @auth @network
  Scenario: Install skill verifies SHA-512 integrity
    Given I am authenticated with Tank
    And I have a consumer project directory
    When I call the "install-skill" tool with:
      | name | @test/hello-world |
    Then the lockfile should contain a sha512 integrity hash
