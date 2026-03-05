@mcp @verify
Feature: Skill integrity verification via MCP tool
  As an AI agent using the Tank MCP server
  I need to verify that all installed skills match their lockfile SHA-512 hashes
  So that I can detect tampering, corruption, or supply chain attacks
  before executing any skill code

  Background:
    Given the MCP server is running

  # ─── verify-skills (happy paths) ──────────────────────────────────────────

  @high
  Scenario: Agent verifies all installed skills and all pass
    Given the skills "@acme/web-search" and "@acme/code-runner" are installed
    And both skills match their SHA-512 hashes recorded in the lockfile
    When the agent calls the "verify-skills" tool
    Then the MCP server reports that all skills passed verification
    And the response lists each skill with a PASS status

  @high
  Scenario: Agent verifies skills and one has been tampered with
    Given the skills "@acme/web-search" and "@acme/code-runner" are installed
    And "@acme/web-search" has been modified after installation
    And "@acme/code-runner" matches its lockfile hash
    When the agent calls the "verify-skills" tool
    Then the MCP server reports that "@acme/web-search" failed verification
    And the response identifies the SHA-512 mismatch for "@acme/web-search"
    And "@acme/code-runner" is reported as passing verification

  @high
  Scenario: Agent verifies skills and one is missing from disk
    Given the skill "@acme/web-search" is recorded in the lockfile
    But the skill files are missing from "~/.tank/skills/@acme/web-search@2.1.0/"
    When the agent calls the "verify-skills" tool
    Then the MCP server reports that "@acme/web-search" is missing
    And the response recommends reinstalling the missing skill

  # ─── verify-skills (edge cases) ───────────────────────────────────────────

  @medium
  Scenario: Agent verifies skills when no skills are installed
    Given no skills are installed and the lockfile is empty
    When the agent calls the "verify-skills" tool
    Then the MCP server reports that there are no skills to verify
    And the tool completes without error

  @medium
  Scenario: Agent verifies skills when no lockfile exists
    Given skills are installed but no lockfile exists
    When the agent calls the "verify-skills" tool
    Then the MCP server returns an error indicating the lockfile is missing
    And the error message suggests running "install-skill" to regenerate the lockfile

  @medium
  Scenario: Agent verifies skills and multiple skills have integrity failures
    Given three skills are installed
    And two of the three skills have been modified after installation
    When the agent calls the "verify-skills" tool
    Then the MCP server reports both failing skills with their SHA-512 mismatches
    And the passing skill is reported as verified
    And the overall result indicates verification failure

  @medium
  Scenario Outline: Agent verifies a specific skill by name
    Given the skill "<skill>" is installed
    And the skill "<skill>" matches its lockfile hash
    When the agent calls the "verify-skills" tool with name "<skill>"
    Then the MCP server reports that "<skill>" passed verification

    Examples:
      | skill                  |
      | @acme/web-search       |
      | @my-org/code-runner    |
      | @tools/file-manager    |
