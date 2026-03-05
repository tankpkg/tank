@mcp @scan
Feature: Security scanning of skills via MCP tool
  As an AI agent using the Tank MCP server
  I need to run security scans on skill directories
  So that I can detect malicious code, credential exfiltration, and supply chain risks
  before installing or publishing a skill

  Background:
    Given the MCP server is running
    And Emma is authenticated with Tank

  # ─── scan-skill (with skills.json) ────────────────────────────────────────

  @high
  Scenario: Agent scans a skill directory that has a skills.json and passes
    Given a skill directory exists at "/workspace/safe-skill"
    And a valid skills.json exists in that directory
    And the skill code contains no security issues
    When the agent calls the "scan-skill" tool with path "/workspace/safe-skill"
    Then the MCP server returns a PASS verdict
    And the response includes a summary of the 6 scan stages completed
    And no critical or high severity findings are reported

  @high
  Scenario: Agent scans a skill directory that contains a critical security issue
    Given a skill directory exists at "/workspace/malicious-skill"
    And a valid skills.json exists in that directory
    And the skill code attempts to exfiltrate credentials
    When the agent calls the "scan-skill" tool with path "/workspace/malicious-skill"
    Then the MCP server returns a FAIL verdict
    And the response includes at least one critical severity finding
    And the finding describes the nature of the security risk

  @high
  Scenario: Agent scans a skill directory that has high severity findings
    Given a skill directory exists at "/workspace/risky-skill"
    And a valid skills.json exists in that directory
    And the skill code contains 4 or more high severity issues
    When the agent calls the "scan-skill" tool with path "/workspace/risky-skill"
    Then the MCP server returns a FAIL verdict
    And the response lists all high severity findings

  @high
  Scenario: Agent scans a skill directory with only medium and low findings
    Given a skill directory exists at "/workspace/minor-issues-skill"
    And a valid skills.json exists in that directory
    And the skill code contains only medium and low severity issues
    When the agent calls the "scan-skill" tool with path "/workspace/minor-issues-skill"
    Then the MCP server returns a PASS_WITH_NOTES verdict
    And the response lists the medium and low severity findings

  # ─── scan-skill (without skills.json — fallback mode) ─────────────────────

  @high
  Scenario: Agent scans an arbitrary directory without a skills.json
    Given a directory exists at "/workspace/arbitrary-code"
    And no skills.json exists in that directory
    And the directory contains TypeScript files with no security issues
    When the agent calls the "scan-skill" tool with path "/workspace/arbitrary-code"
    Then the MCP server synthesises a minimal manifest and proceeds with the scan
    And the MCP server returns a PASS verdict
    And the response notes that no skills.json was found and a synthesised manifest was used

  @high
  Scenario: Agent scans an arbitrary directory without skills.json that has critical issues
    Given a directory exists at "/workspace/arbitrary-malicious"
    And no skills.json exists in that directory
    And the directory contains code that attempts to read environment variables and send them externally
    When the agent calls the "scan-skill" tool with path "/workspace/arbitrary-malicious"
    Then the MCP server synthesises a minimal manifest and proceeds with the scan
    And the MCP server returns a FAIL verdict
    And the response includes critical severity findings

  @medium
  Scenario: Agent scans an empty directory
    Given an empty directory exists at "/workspace/empty"
    When the agent calls the "scan-skill" tool with path "/workspace/empty"
    Then the MCP server returns an error indicating there are no files to scan

  @medium
  Scenario: Agent scans a directory that does not exist
    Given no directory exists at "/workspace/missing"
    When the agent calls the "scan-skill" tool with path "/workspace/missing"
    Then the MCP server returns an error indicating the path does not exist

  # ─── authentication ────────────────────────────────────────────────────────

  @high
  Scenario: Agent attempts to scan without being authenticated
    Given no user is authenticated with Tank
    When the agent calls the "scan-skill" tool with path "/workspace/some-skill"
    Then the MCP server returns an authentication error
    And the error message suggests running the "login" tool first

  # ─── scan stages ──────────────────────────────────────────────────────────

  @medium
  Scenario: Agent receives detailed stage-by-stage results from a scan
    Given a skill directory exists at "/workspace/detailed-skill"
    And a valid skills.json exists in that directory
    When the agent calls the "scan-skill" tool with path "/workspace/detailed-skill"
    Then the MCP server returns results for all 6 scan stages
    And each stage result includes its name and status
    And the overall verdict reflects the most severe finding across all stages
