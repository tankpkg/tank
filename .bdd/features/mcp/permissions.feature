@mcp @permissions
Feature: Skill permissions display via MCP tool
  As an AI agent using the Tank MCP server
  I need to view the resolved permission summary for skills in a project
  So that I can understand what capabilities each skill requires
  and make informed decisions about whether to grant those permissions

  Background:
    Given the MCP server is running

  # ─── skill-permissions (happy paths) ──────────────────────────────────────

  @high
  Scenario: Agent views permissions for a project with multiple skills
    Given a skills.json exists in "/workspace/my-project"
    And the skills.json declares "@acme/web-search" and "@acme/file-reader" as dependencies
    And "@acme/web-search" requires network access permissions
    And "@acme/file-reader" requires filesystem read permissions
    When the agent calls the "skill-permissions" tool with path "/workspace/my-project"
    Then the MCP server returns the resolved permission summary for all skills
    And the response lists "@acme/web-search" with its network access requirements
    And the response lists "@acme/file-reader" with its filesystem read requirements

  @high
  Scenario: Agent views permissions for a project with a single skill
    Given a skills.json exists in "/workspace/my-project"
    And the skills.json declares "@acme/web-search" as a dependency
    And "@acme/web-search" requires network access and no other permissions
    When the agent calls the "skill-permissions" tool with path "/workspace/my-project"
    Then the MCP server returns the permission summary for "@acme/web-search"
    And the response shows only network access as a required permission

  @high
  Scenario: Agent views permissions for a project where skills require no special permissions
    Given a skills.json exists in "/workspace/my-project"
    And the skills.json declares "@acme/text-formatter" as a dependency
    And "@acme/text-formatter" declares no permissions
    When the agent calls the "skill-permissions" tool with path "/workspace/my-project"
    Then the MCP server returns the permission summary
    And the response indicates "@acme/text-formatter" requires no special permissions

  # ─── skill-permissions (error cases) ──────────────────────────────────────

  @high
  Scenario: Agent views permissions when no skills.json exists
    Given no skills.json exists in "/workspace/empty-project"
    When the agent calls the "skill-permissions" tool with path "/workspace/empty-project"
    Then the MCP server returns an error indicating no skills.json was found
    And the error message suggests running "init-skill" to create one

  @medium
  Scenario: Agent views permissions when the directory does not exist
    Given no directory exists at "/workspace/nonexistent"
    When the agent calls the "skill-permissions" tool with path "/workspace/nonexistent"
    Then the MCP server returns an error indicating the directory does not exist

  @medium
  Scenario: Agent views permissions when skills.json has no dependencies
    Given a skills.json exists in "/workspace/my-project"
    And the skills.json declares no skill dependencies
    When the agent calls the "skill-permissions" tool with path "/workspace/my-project"
    Then the MCP server returns an empty permission summary
    And the response indicates there are no skills with permissions to display

  @medium
  Scenario Outline: Agent views permissions for skills with various permission types
    Given a skills.json exists in "/workspace/my-project"
    And the skills.json declares a skill that requires "<permission_type>" permissions
    When the agent calls the "skill-permissions" tool with path "/workspace/my-project"
    Then the MCP server returns a summary that includes "<permission_type>" in the permissions list

    Examples:
      | permission_type    |
      | network            |
      | filesystem:read    |
      | filesystem:write   |
      | env                |
      | exec               |
