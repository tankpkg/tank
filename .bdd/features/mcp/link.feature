@mcp @link
Feature: Skill linking and unlinking via MCP tools
  As an AI agent using the Tank MCP server
  I need to link installed skills into an agent workspace
  So that the agent runtime can discover and load skills from a consistent location,
  and unlink them when they are no longer needed

  Background:
    Given the MCP server is running

  # ─── link-skill (happy paths) ─────────────────────────────────────────────

  @high
  Scenario: Agent links an installed skill into the workspace
    Given the skill "@acme/web-search" is installed at version "2.1.0"
    And an agent workspace exists at "/workspace/my-agent"
    When the agent calls the "link-skill" tool with name "@acme/web-search" and workspace "/workspace/my-agent"
    Then the MCP server creates a symlink in "/workspace/my-agent"
    And the symlink points to "~/.tank/skills/@acme/web-search@2.1.0/"
    And the MCP server confirms the link was created successfully

  @high
  Scenario: Agent links a skill that is already linked
    Given the skill "@acme/web-search" is installed at version "2.1.0"
    And the skill is already linked into "/workspace/my-agent"
    When the agent calls the "link-skill" tool with name "@acme/web-search" and workspace "/workspace/my-agent"
    Then the MCP server reports that the skill is already linked
    And the existing symlink is not modified

  @medium
  Scenario: Agent links multiple skills into the same workspace
    Given the skills "@acme/web-search" and "@acme/code-runner" are installed
    And an agent workspace exists at "/workspace/my-agent"
    When the agent calls the "link-skill" tool with name "@acme/web-search" and workspace "/workspace/my-agent"
    And the agent calls the "link-skill" tool with name "@acme/code-runner" and workspace "/workspace/my-agent"
    Then both skills are linked into "/workspace/my-agent"
    And each symlink points to the correct installed version

  # ─── link-skill (error cases) ─────────────────────────────────────────────

  @high
  Scenario: Agent links a skill that is not installed
    Given the skill "@acme/nonexistent-skill" is not installed
    When the agent calls the "link-skill" tool with name "@acme/nonexistent-skill" and workspace "/workspace/my-agent"
    Then the MCP server returns a not-found error
    And the error message indicates the skill must be installed before it can be linked

  @high
  Scenario: Agent links a skill into a workspace that does not exist
    Given the skill "@acme/web-search" is installed at version "2.1.0"
    And no directory exists at "/workspace/nonexistent-agent"
    When the agent calls the "link-skill" tool with name "@acme/web-search" and workspace "/workspace/nonexistent-agent"
    Then the MCP server returns an error indicating the workspace directory does not exist

  @medium
  Scenario: Agent links a skill with a name that is not scoped
    When the agent calls the "link-skill" tool with name "web-search" and workspace "/workspace/my-agent"
    Then the MCP server returns a validation error
    And the error message explains that skill names must use the @org/name format

  # ─── unlink-skill (happy paths) ───────────────────────────────────────────

  @high
  Scenario: Agent unlinks a skill from the workspace
    Given the skill "@acme/web-search" is installed and linked into "/workspace/my-agent"
    When the agent calls the "unlink-skill" tool with name "@acme/web-search" and workspace "/workspace/my-agent"
    Then the MCP server removes the symlink from "/workspace/my-agent"
    And the installed skill files remain intact at "~/.tank/skills/@acme/web-search@2.1.0/"
    And the MCP server confirms the link was removed successfully

  @high
  Scenario: Agent unlinks a skill that is not linked
    Given the skill "@acme/web-search" is installed but not linked into "/workspace/my-agent"
    When the agent calls the "unlink-skill" tool with name "@acme/web-search" and workspace "/workspace/my-agent"
    Then the MCP server reports that no link exists for that skill in the workspace
    And the tool completes without error

  # ─── unlink-skill (error cases) ───────────────────────────────────────────

  @high
  Scenario: Agent unlinks a skill that is not installed
    Given the skill "@acme/nonexistent-skill" is not installed
    When the agent calls the "unlink-skill" tool with name "@acme/nonexistent-skill" and workspace "/workspace/my-agent"
    Then the MCP server returns a not-found error

  @medium
  Scenario: Agent unlinks a skill with a name that is not scoped
    When the agent calls the "unlink-skill" tool with name "web-search" and workspace "/workspace/my-agent"
    Then the MCP server returns a validation error
    And the error message explains that skill names must use the @org/name format

  @medium
  Scenario: Agent unlinks a skill from a workspace that does not exist
    Given the skill "@acme/web-search" is installed
    And no directory exists at "/workspace/nonexistent-agent"
    When the agent calls the "unlink-skill" tool with name "@acme/web-search" and workspace "/workspace/nonexistent-agent"
    Then the MCP server returns an error indicating the workspace directory does not exist
