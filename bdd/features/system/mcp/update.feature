@mcp
@update
Feature: Skill update via MCP tool
  As an AI agent using the Tank MCP server
  I need to update installed skills to newer versions
  So that agents benefit from bug fixes and improvements
  while staying within the semver range declared in skills.json

  Background:
    Given the MCP server is running
    And Emma is authenticated with Tank

  # ─── update-skill (happy paths) ───────────────────────────────────────────
  @high
  Scenario: Agent updates a skill to the latest version within its semver range
    Given the skill "@acme/web-search" is installed at version "2.0.0"
    And the skills.json declares "@acme/web-search" with range "^2.0.0"
    And version "2.3.0" of "@acme/web-search" is available in the registry
    When the agent calls the "update-skill" tool with name "@acme/web-search"
    Then the MCP server resolves version "2.3.0" as the latest compatible version
    And the new tarball is fetched and its SHA-512 hash is verified
    And the skill is updated to version "2.3.0" in "~/.tank/skills/@acme/web-search@2.3.0/"
    And the lockfile is updated with the new version and SHA-512 hash

  @high
  Scenario: Agent updates a skill that is already at the latest compatible version
    Given the skill "@acme/web-search" is installed at version "2.3.0"
    And the skills.json declares "@acme/web-search" with range "^2.0.0"
    And "2.3.0" is the latest version within "^2.0.0" in the registry
    When the agent calls the "update-skill" tool with name "@acme/web-search"
    Then the MCP server reports that the skill is already at the latest compatible version
    And no files are modified

  @medium
  Scenario: Agent updates a skill and a newer major version exists but is out of range
    Given the skill "@acme/web-search" is installed at version "2.3.0"
    And the skills.json declares "@acme/web-search" with range "^2.0.0"
    And version "3.0.0" of "@acme/web-search" is available in the registry
    When the agent calls the "update-skill" tool with name "@acme/web-search"
    Then the MCP server reports that the skill is already at the latest compatible version
    And the response notes that version "3.0.0" exists but is outside the declared range

  # ─── update-skill (error cases) ───────────────────────────────────────────
  @high
  Scenario: Agent updates a skill that is not installed
    Given the skill "@acme/nonexistent-skill" is not installed
    When the agent calls the "update-skill" tool with name "@acme/nonexistent-skill"
    Then the MCP server returns a not-found error
    And the error message indicates the skill is not installed

  @high
  Scenario: Agent attempts to update without being authenticated
    Given no user is authenticated with Tank
    When the agent calls the "update-skill" tool with name "@acme/web-search"
    Then the MCP server returns an authentication error
    And the error message suggests running the "login" tool first

  @medium
  Scenario: Agent updates a skill when the registry is unreachable
    Given the skill "@acme/web-search" is installed at version "2.0.0"
    And the Tank registry is unreachable
    When the agent calls the "update-skill" tool with name "@acme/web-search"
    Then the MCP server returns a connectivity error
    And the installed skill remains at version "2.0.0"

  @medium
  Scenario: Agent updates a skill whose new tarball fails SHA-512 verification
    Given the skill "@acme/web-search" is installed at version "2.0.0"
    And version "2.3.0" of "@acme/web-search" is available in the registry
    And the tarball for version "2.3.0" has been tampered with
    When the agent calls the "update-skill" tool with name "@acme/web-search"
    Then the MCP server returns an integrity error
    And the installed skill remains at version "2.0.0"
    And the lockfile is not modified

  @medium
  Scenario: Agent updates a skill with a name that is not scoped
    When the agent calls the "update-skill" tool with name "web-search"
    Then the MCP server returns a validation error
    And the error message explains that skill names must use the @org/name format
