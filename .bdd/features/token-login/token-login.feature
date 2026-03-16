# Intent: .idd/modules/token-login/INTENT.md
# Layer: Constraints (C1–C8), Examples (E1–E8)

@token-login
Feature: CLI token-based login without browser
  As a developer in a corporate environment
  I want to authenticate by pasting a pre-generated API token
  So that I can use Tank without browser-based OAuth

  # ── Successful token login (C1, C2) ────────────────────────────────────
  @high
  Scenario: Valid token is accepted and saved to config (E1)
    Given I have a valid API token "tank_valid123"
    When I run "tank login --token tank_valid123"
    Then the token is validated against /api/v1/auth/whoami
    And ~/.tank/config.json contains the token
    And ~/.tank/config.json contains the user's name and email
    And the output contains "Logged in as"

  # ── Expired token (C3) ────────────────────────────────────────────────
  @high
  Scenario: Expired token shows error with dashboard URL (E2)
    Given I have an expired API token "tank_expired"
    When I run "tank login --token tank_expired"
    Then the output contains "Invalid or expired token"
    And the output contains the registry dashboard URL
    And ~/.tank/config.json is unchanged

  # ── Revoked token (C3) ────────────────────────────────────────────────
  @high
  Scenario: Revoked token shows same error as expired (E3)
    Given I have a revoked API token "tank_revoked"
    When I run "tank login --token tank_revoked"
    Then the output contains "Invalid or expired token"
    And ~/.tank/config.json is unchanged

  # ── Empty token (C8) ──────────────────────────────────────────────────
  @high
  Scenario: Empty token shows usage error without network call (E4)
    When I run "tank login --token" with an empty string
    Then the output contains a usage error about empty token
    And no HTTP request is made to the registry

  # ── Custom registry (C5) ──────────────────────────────────────────────
  @high
  Scenario: Token validated against custom on-prem registry (E5)
    Given TANK_REGISTRY is set to "https://tank.internal.corp.com"
    And I have a valid token for that registry
    When I run "tank login --token tank_onprem_valid"
    Then the validation request goes to "https://tank.internal.corp.com/api/v1/auth/whoami"
    And the login succeeds

  # ── Interop with whoami (C2) ───────────────────────────────────────────
  @high
  Scenario: whoami works after token login (E6)
    Given I have logged in via "tank login --token tank_valid123"
    When I run "tank whoami"
    Then the output shows the same user info as the token owner

  # ── MCP parity (C6) ───────────────────────────────────────────────────
  @medium
  Scenario: MCP login tool accepts token parameter (E7)
    Given I call the MCP "login" tool with { "token": "tank_valid123" }
    Then the tool validates the token against the registry
    And ~/.tank/config.json contains the token and user info

  # ── Overwrite existing login (C2) ──────────────────────────────────────
  @medium
  Scenario: Token login overwrites previous session (E8)
    Given I am logged in as "alice@corp.com"
    When I run "tank login --token tank_bob_token"
    Then ~/.tank/config.json contains bob's token and user info
    And the output indicates the identity changed

  # ── Mutual exclusion with browser flow (C4) ────────────────────────────
  @medium
  Scenario: --token flag skips browser entirely
    When I run "tank login --token tank_valid123"
    Then no browser window is opened
    And no POST is made to /api/v1/cli-auth/start
