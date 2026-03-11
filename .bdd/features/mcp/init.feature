@mcp
@init
Feature: Skill project initialisation via MCP tool
  As an AI agent using the Tank MCP server
  I need to create a skills.json manifest in a directory
  So that the directory becomes a valid Tank skill project ready for development and publishing

  Background:
    Given the MCP server is running

  # ─── init-skill ───────────────────────────────────────────────────────────
  @high
  Scenario: Agent initialises a new skill project with all required fields
    Given a directory exists at "/workspace/my-skill"
    And no skills.json exists in that directory
    When the agent calls the "init-skill" tool with name "@acme/my-skill", version "1.0.0", and description "A useful skill"
    Then the MCP server creates a skills.json in "/workspace/my-skill"
    And the skills.json contains the name "@acme/my-skill"
    And the skills.json contains the version "1.0.0"
    And the skills.json contains the description "A useful skill"

  @high
  Scenario: Agent initialises a skill project when skills.json already exists
    Given a directory exists at "/workspace/existing-skill"
    And a skills.json already exists in that directory
    When the agent calls the "init-skill" tool with name "@acme/existing-skill", version "1.0.0", and description "Already exists"
    Then the MCP server returns an error indicating skills.json already exists
    And the existing skills.json is not modified

  @high
  Scenario: Agent provides a skill name that is not scoped
    Given a directory exists at "/workspace/my-skill"
    When the agent calls the "init-skill" tool with name "my-skill", version "1.0.0", and description "Missing scope"
    Then the MCP server returns a validation error
    And the error message explains that skill names must use the @org/name format

  @high
  Scenario: Agent provides an invalid semantic version
    Given a directory exists at "/workspace/my-skill"
    When the agent calls the "init-skill" tool with name "@acme/my-skill", version "not-a-version", and description "Bad version"
    Then the MCP server returns a validation error
    And the error message explains that version must be a valid semver string

  @medium
  Scenario: Agent initialises a skill project in a non-existent directory
    Given no directory exists at "/workspace/does-not-exist"
    When the agent calls the "init-skill" tool with name "@acme/new-skill", version "1.0.0", and description "New skill"
    Then the MCP server returns an error indicating the target directory does not exist

  @medium
  Scenario: Agent omits the description field
    Given a directory exists at "/workspace/my-skill"
    When the agent calls the "init-skill" tool with name "@acme/my-skill" and version "1.0.0" but no description
    Then the MCP server returns a validation error
    And the error message identifies description as a required field

  @medium
  Scenario Outline: Agent initialises skills with various valid scoped names
    Given a directory exists at "<directory>"
    When the agent calls the "init-skill" tool with name "<name>", version "1.0.0", and description "Test skill"
    Then the MCP server creates a skills.json with name "<name>"

    Examples:
      | directory          | name                    |
      | /workspace/skill-a | @acme/skill-a           |
      | /workspace/skill-b | @my-org/complex-skill   |
      | /workspace/skill-c | @123org/skill-with-nums |
