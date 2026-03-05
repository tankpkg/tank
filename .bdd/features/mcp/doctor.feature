@mcp @doctor
Feature: Environment diagnostics via MCP tool
  As an AI agent using the Tank MCP server
  I need to diagnose the Tank setup and environment
  So that I can identify and report configuration problems, connectivity issues,
  and missing prerequisites before attempting other operations

  Background:
    Given the MCP server is running

  # ─── doctor (fully healthy environment) ───────────────────────────────────

  @high
  Scenario: Agent runs diagnostics on a fully healthy environment
    Given Emma is authenticated with Tank
    And the Tank registry is reachable
    And the Node.js version meets the minimum requirement
    And the Tank configuration file exists and is valid
    When the agent calls the "doctor" tool
    Then the MCP server reports that all checks passed
    And the response includes a check for authentication status showing PASS
    And the response includes a check for registry connectivity showing PASS
    And the response includes a check for Node.js version showing PASS
    And the response includes a check for configuration file showing PASS

  # ─── doctor (authentication checks) ──────────────────────────────────────

  @high
  Scenario: Agent runs diagnostics when not authenticated
    Given no user is authenticated with Tank
    And the Tank registry is reachable
    And the Node.js version meets the minimum requirement
    When the agent calls the "doctor" tool
    Then the MCP server reports that the authentication check failed
    And the response suggests running the "login" tool to authenticate
    And other passing checks are still reported

  @medium
  Scenario: Agent runs diagnostics when credentials are expired
    Given Emma has expired credentials stored locally
    When the agent calls the "doctor" tool
    Then the MCP server reports that the authentication check failed due to expired credentials
    And the response suggests running the "login" tool to re-authenticate

  # ─── doctor (connectivity checks) ─────────────────────────────────────────

  @high
  Scenario: Agent runs diagnostics when the registry is unreachable
    Given Emma is authenticated with Tank
    And the Tank registry is unreachable
    And the Node.js version meets the minimum requirement
    When the agent calls the "doctor" tool
    Then the MCP server reports that the registry connectivity check failed
    And the response includes the registry URL that was tested
    And the authentication and Node.js checks are still reported

  # ─── doctor (Node.js version checks) ──────────────────────────────────────

  @high
  Scenario: Agent runs diagnostics when Node.js version is below the minimum
    Given Emma is authenticated with Tank
    And the Tank registry is reachable
    And the Node.js version is below the minimum requirement
    When the agent calls the "doctor" tool
    Then the MCP server reports that the Node.js version check failed
    And the response shows the current version and the minimum required version

  @medium
  Scenario: Agent runs diagnostics when Node.js version meets the minimum exactly
    Given Emma is authenticated with Tank
    And the Tank registry is reachable
    And the Node.js version is exactly the minimum required version
    When the agent calls the "doctor" tool
    Then the MCP server reports that the Node.js version check passed

  # ─── doctor (configuration checks) ───────────────────────────────────────

  @high
  Scenario: Agent runs diagnostics when the configuration file is missing
    Given no Tank configuration file exists
    When the agent calls the "doctor" tool
    Then the MCP server reports that the configuration file check failed
    And the response indicates the expected configuration file location

  @medium
  Scenario: Agent runs diagnostics when the configuration file is malformed
    Given a malformed Tank configuration file exists
    When the agent calls the "doctor" tool
    Then the MCP server reports that the configuration file check failed
    And the response describes the configuration error

  # ─── doctor (multiple failures) ───────────────────────────────────────────

  @medium
  Scenario: Agent runs diagnostics when multiple checks fail
    Given no user is authenticated with Tank
    And the Tank registry is unreachable
    And the Node.js version is below the minimum requirement
    When the agent calls the "doctor" tool
    Then the MCP server reports failures for all three checks
    And the response provides actionable suggestions for each failure
    And the overall result indicates the environment is not healthy

  # ─── doctor (summary) ─────────────────────────────────────────────────────

  @medium
  Scenario: Agent receives a structured summary from the doctor tool
    Given Emma is authenticated with Tank
    When the agent calls the "doctor" tool
    Then the MCP server returns a structured result with a status for each check
    And each check result includes a name, status, and optional message
    And the overall summary indicates whether the environment is ready to use
