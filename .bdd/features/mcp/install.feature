@mcp @install
Feature: Skill installation via MCP tool
  As an AI agent using the Tank MCP server
  I need to install skills from the Tank registry
  So that AI agents have access to verified, security-scanned capabilities
  with cryptographic integrity guarantees

  Background:
    Given the MCP server is running
    And Emma is authenticated with Tank

  # ─── install-skill (happy paths) ──────────────────────────────────────────

  @high
  Scenario: Agent installs a skill by name and latest version is resolved
    Given the skill "@acme/web-search" exists in the Tank registry
    And a skills.json exists in the current project directory
    When the agent calls the "install-skill" tool with name "@acme/web-search"
    Then the MCP server resolves the latest compatible version
    And the skill tarball is fetched from the registry
    And the SHA-512 hash of the tarball is verified
    And the skill is extracted to "~/.tank/skills/@acme/web-search@<version>/"
    And the lockfile is updated with the skill name, version, and SHA-512 hash
    And the skills.json is updated to include "@acme/web-search"

  @high
  Scenario: Agent installs a skill at a specific version
    Given the skill "@acme/web-search" at version "2.1.0" exists in the Tank registry
    And a skills.json exists in the current project directory
    When the agent calls the "install-skill" tool with name "@acme/web-search" and version "2.1.0"
    Then the MCP server installs exactly version "2.1.0"
    And the lockfile records version "2.1.0" with its SHA-512 hash

  @high
  Scenario: Agent installs a skill that is already installed at the same version
    Given the skill "@acme/web-search" at version "2.1.0" is already installed
    When the agent calls the "install-skill" tool with name "@acme/web-search" and version "2.1.0"
    Then the MCP server reports that the skill is already installed at that version
    And no files are modified

  # ─── install-skill (integrity) ────────────────────────────────────────────

  @high
  Scenario: Agent installs a skill whose tarball fails SHA-512 verification
    Given the skill "@acme/tampered-skill" exists in the Tank registry
    And the tarball for "@acme/tampered-skill" has been tampered with
    When the agent calls the "install-skill" tool with name "@acme/tampered-skill"
    Then the MCP server returns an integrity error
    And the error message reports the SHA-512 mismatch
    And no files are extracted to the skills directory

  # ─── install-skill (error cases) ──────────────────────────────────────────

  @high
  Scenario: Agent installs a skill that does not exist in the registry
    Given no skill named "@acme/nonexistent-skill" exists in the Tank registry
    When the agent calls the "install-skill" tool with name "@acme/nonexistent-skill"
    Then the MCP server returns a not-found error
    And the error message identifies the skill name

  @high
  Scenario: Agent installs a skill at a version that does not exist
    Given the skill "@acme/web-search" exists in the Tank registry
    But version "99.0.0" of "@acme/web-search" does not exist
    When the agent calls the "install-skill" tool with name "@acme/web-search" and version "99.0.0"
    Then the MCP server returns a version-not-found error

  @high
  Scenario: Agent attempts to install without being authenticated
    Given no user is authenticated with Tank
    When the agent calls the "install-skill" tool with name "@acme/web-search"
    Then the MCP server returns an authentication error
    And the error message suggests running the "login" tool first

  @medium
  Scenario: Agent installs a skill when the registry is unreachable
    Given Emma is authenticated with Tank
    And the Tank registry is unreachable
    When the agent calls the "install-skill" tool with name "@acme/web-search"
    Then the MCP server returns a connectivity error
    And no partial installation is left on disk

  @medium
  Scenario: Agent installs a skill with a semver range
    Given the skill "@acme/web-search" exists in the Tank registry with versions "2.0.0", "2.1.0", and "2.2.0"
    And a skills.json exists in the current project directory
    When the agent calls the "install-skill" tool with name "@acme/web-search" and version "^2.0.0"
    Then the MCP server resolves and installs the highest compatible version "2.2.0"
    And the lockfile records the resolved version "2.2.0"

  @medium
  Scenario: Agent installs a skill with a name that is not scoped
    When the agent calls the "install-skill" tool with name "web-search"
    Then the MCP server returns a validation error
    And the error message explains that skill names must use the @org/name format
