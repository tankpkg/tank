@mcp @remove
Feature: Skill removal via MCP tool
  As an AI agent using the Tank MCP server
  I need to remove installed skills
  So that agents can clean up unused capabilities and keep their environment lean

  Background:
    Given the MCP server is running

  # ─── remove-skill (happy paths) ───────────────────────────────────────────

  @high
  Scenario: Agent removes an installed skill
    Given the skill "@acme/web-search" is installed at version "2.1.0"
    And the skills.json lists "@acme/web-search" as a dependency
    When the agent calls the "remove-skill" tool with name "@acme/web-search"
    Then the MCP server removes the skill files from "~/.tank/skills/@acme/web-search@2.1.0/"
    And the lockfile entry for "@acme/web-search" is removed
    And the skills.json no longer lists "@acme/web-search"

  @high
  Scenario: Agent removes a skill that has an active symlink
    Given the skill "@acme/web-search" is installed at version "2.1.0"
    And the skill is linked into the agent workspace
    When the agent calls the "remove-skill" tool with name "@acme/web-search"
    Then the MCP server removes the symlink from the agent workspace
    And the skill files are removed from the skills directory
    And the lockfile entry is removed

  @medium
  Scenario: Agent removes one skill when multiple skills are installed
    Given the skill "@acme/web-search" is installed at version "2.1.0"
    And the skill "@acme/code-runner" is installed at version "1.0.0"
    When the agent calls the "remove-skill" tool with name "@acme/web-search"
    Then only "@acme/web-search" is removed
    And "@acme/code-runner" remains installed and in the lockfile

  # ─── remove-skill (error cases) ───────────────────────────────────────────

  @high
  Scenario: Agent removes a skill that is not installed
    Given the skill "@acme/nonexistent-skill" is not installed
    When the agent calls the "remove-skill" tool with name "@acme/nonexistent-skill"
    Then the MCP server returns a not-found error
    And the error message indicates the skill is not installed

  @high
  Scenario: Agent removes a skill that is in the lockfile but files are missing
    Given the skill "@acme/web-search" is recorded in the lockfile
    But the skill files are missing from "~/.tank/skills/@acme/web-search@2.1.0/"
    When the agent calls the "remove-skill" tool with name "@acme/web-search"
    Then the MCP server removes the lockfile entry
    And the MCP server reports that the skill files were already absent
    And the tool completes without error

  @medium
  Scenario: Agent removes a skill with a name that is not scoped
    When the agent calls the "remove-skill" tool with name "web-search"
    Then the MCP server returns a validation error
    And the error message explains that skill names must use the @org/name format

  @medium
  Scenario: Agent removes a skill when no skills.json exists in the project
    Given the skill "@acme/web-search" is installed at version "2.1.0"
    And no skills.json exists in the current project directory
    When the agent calls the "remove-skill" tool with name "@acme/web-search"
    Then the MCP server removes the skill files and lockfile entry
    And the tool completes without error
