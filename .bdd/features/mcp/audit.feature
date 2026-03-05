@mcp @audit
Feature: Security audit results via MCP tool
  As an AI agent using the Tank MCP server
  I need to retrieve security scan results for skills
  So that I can make informed decisions about whether to use a skill
  and understand any risks before execution

  Background:
    Given the MCP server is running
    And Emma is authenticated with Tank

  # ─── audit-skill (registry skills) ───────────────────────────────────────

  @high
  Scenario: Agent audits a registry skill that has a clean security record
    Given the skill "@acme/web-search" exists in the Tank registry
    And the skill has been scanned and received a PASS verdict
    When the agent calls the "audit-skill" tool with name "@acme/web-search"
    Then the MCP server returns the security scan results for "@acme/web-search"
    And the results show a PASS verdict
    And the results include the scan date and version scanned

  @high
  Scenario: Agent audits a registry skill that has security findings
    Given the skill "@acme/risky-skill" exists in the Tank registry
    And the skill has been scanned and received a FLAGGED verdict with high severity findings
    When the agent calls the "audit-skill" tool with name "@acme/risky-skill"
    Then the MCP server returns the security scan results for "@acme/risky-skill"
    And the results show a FLAGGED verdict
    And the results list all high severity findings with descriptions

  @high
  Scenario: Agent audits a registry skill that failed security scanning
    Given the skill "@acme/malicious-skill" exists in the Tank registry
    And the skill has been scanned and received a FAIL verdict
    When the agent calls the "audit-skill" tool with name "@acme/malicious-skill"
    Then the MCP server returns the security scan results for "@acme/malicious-skill"
    And the results show a FAIL verdict
    And the results include the critical findings that caused the failure

  # ─── audit-skill (installed skills) ──────────────────────────────────────

  @high
  Scenario: Agent audits an installed skill
    Given the skill "@acme/web-search" is installed at version "2.1.0"
    And the skill has scan results available in the registry
    When the agent calls the "audit-skill" tool with name "@acme/web-search"
    Then the MCP server returns the security scan results for the installed version
    And the results are specific to version "2.1.0"

  @medium
  Scenario: Agent audits a skill at a specific version
    Given the skill "@acme/web-search" exists in the Tank registry with versions "2.0.0" and "2.1.0"
    When the agent calls the "audit-skill" tool with name "@acme/web-search" and version "2.0.0"
    Then the MCP server returns the security scan results for version "2.0.0"
    And the results are not for version "2.1.0"

  # ─── audit-skill (error cases) ────────────────────────────────────────────

  @high
  Scenario: Agent audits a skill that does not exist in the registry
    Given no skill named "@acme/nonexistent-skill" exists in the Tank registry
    When the agent calls the "audit-skill" tool with name "@acme/nonexistent-skill"
    Then the MCP server returns a not-found error
    And the error message identifies the skill name

  @high
  Scenario: Agent attempts to audit without being authenticated
    Given no user is authenticated with Tank
    When the agent calls the "audit-skill" tool with name "@acme/web-search"
    Then the MCP server returns an authentication error
    And the error message suggests running the "login" tool first

  @medium
  Scenario: Agent audits a skill that has not yet been scanned
    Given the skill "@acme/new-skill" exists in the Tank registry
    And the skill has not yet been through security scanning
    When the agent calls the "audit-skill" tool with name "@acme/new-skill"
    Then the MCP server returns a response indicating no scan results are available
    And the response suggests the skill is pending security review

  @medium
  Scenario: Agent audits a skill when the registry is unreachable
    Given Emma is authenticated with Tank
    And the Tank registry is unreachable
    When the agent calls the "audit-skill" tool with name "@acme/web-search"
    Then the MCP server returns a connectivity error
