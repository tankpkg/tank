@mcp
@auth
Feature: Authentication management via MCP tools
  As an AI agent using the Tank MCP server
  I need to manage authentication state
  So that I can operate securely on behalf of the user and report identity clearly

  Background:
    Given the MCP server is running

  # ─── logout ───────────────────────────────────────────────────────────────
  @high
  Scenario: Agent clears credentials when user is authenticated
    Given Emma is authenticated with Tank
    When the agent calls the "logout" tool
    Then the MCP server reports that Emma has been logged out successfully
    And subsequent calls to authenticated tools are rejected

  @high
  Scenario: Agent calls logout when no credentials exist
    Given no user is authenticated with Tank
    When the agent calls the "logout" tool
    Then the MCP server reports that there are no credentials to clear
    And the tool completes without error

  @medium
  Scenario: Agent calls logout and credentials are fully removed
    Given Emma is authenticated with Tank
    When the agent calls the "logout" tool
    Then the MCP server confirms all stored credentials have been removed
    And the "whoami" tool reports that no user is logged in

  # ─── whoami ───────────────────────────────────────────────────────────────
  @high
  Scenario: Agent retrieves identity when user is authenticated
    Given Emma is authenticated with Tank
    When the agent calls the "whoami" tool
    Then the MCP server returns Emma's name and email address
    And the response includes her Tank username

  @high
  Scenario: Agent retrieves identity when no user is authenticated
    Given no user is authenticated with Tank
    When the agent calls the "whoami" tool
    Then the MCP server reports that no user is currently logged in
    And the tool completes without error

  @medium
  Scenario: Agent retrieves identity when the registry is unreachable
    Given Emma is authenticated with Tank
    And the Tank registry is unreachable
    When the agent calls the "whoami" tool
    Then the MCP server returns a connectivity error
    And the error message suggests checking network access

  @medium
  Scenario: Agent retrieves identity when stored credentials are expired
    Given Emma has expired credentials stored locally
    When the agent calls the "whoami" tool
    Then the MCP server reports that the session has expired
    And the error message suggests running the "login" tool to re-authenticate
