# Intent: idd/modules/vault/INTENT.md

@vault
@runner
Feature: Agent runner — tank run <agent>
  As an AI agent developer
  I need a single command to launch my agent with full credential protection
  So that I don't have to manually configure proxies or env vars

  # ── Full happy flow ──────────────────────────────────────────────────────
  @high
  @happy-flow
  Scenario: End-to-end — tank run starts proxy with per-agent strategy, agent runs, proxy catches credentials in traffic, agent exits clean
    Given "claude" is available in PATH
    When the user runs "tank run claude"
    Then the vault proxy starts on a random available port
    And the output shows "Vault proxy started on port XXXX"
    And the output shows "Agent: claude (Node.js) — using NODE_OPTIONS injection"
    And NODE_OPTIONS is set with the proxy bootstrap for the child process
    And the "claude" process is launched as a child process
    And the proxy is actively intercepting requests — credentials will be caught from traffic
    When the agent process exits with code 0
    Then the output shows "Agent exited. Cleaning up..."
    And the proxy server shuts down
    And the session vault is cleared (0 mappings remain)
    And "tank run" exits with code 0

  # ── Per-agent launch strategies (C21, C22) ────────────────────────────────
  @high
  Scenario: tank run claude — Node.js agent uses NODE_OPTIONS injection
    When the user runs "tank run claude"
    Then the vault proxy starts on a random available port
    And the child process environment has NODE_OPTIONS containing "--require" and the proxy bootstrap path
    And HTTPS_PROXY is also set as a secondary mechanism
    And the "claude" process is launched as a child process
    And the proxy is actively intercepting requests

  @high
  Scenario: tank run opencode — Bun agent uses provider base URL overrides
    When the user runs "tank run opencode"
    Then the vault proxy starts on a random available port
    And the child process environment has ANTHROPIC_BASE_URL pointing to the proxy
    And the child process environment has OPENAI_BASE_URL pointing to the proxy
    And the "opencode" process is launched as a child process

  @high
  Scenario: tank run cursor — Electron agent uses HTTPS_PROXY
    When the user runs "tank run cursor"
    Then the vault proxy starts on a random available port
    And the child process environment has HTTPS_PROXY pointing to the proxy
    And the "cursor" process is launched as a child process

  @high
  Scenario: tank run codex — Rust agent uses HTTPS_PROXY (native support)
    When the user runs "tank run codex"
    Then the vault proxy starts on a random available port
    And the child process environment has HTTPS_PROXY pointing to the proxy
    And the "codex" process is launched as a child process

  @medium
  Scenario: tank run openclaw — unknown runtime uses best-effort injection
    When the user runs "tank run openclaw"
    Then the vault proxy starts on a random available port
    And the child process environment has HTTPS_PROXY pointing to the proxy
    And the child process environment has NODE_OPTIONS containing the proxy bootstrap (if Node.js)
    And the "openclaw" process is launched as a child process

  @medium
  Scenario: tank run universal — generic agent uses all injection methods
    When the user runs "tank run universal"
    Then the vault proxy starts on a random available port
    And the child process environment has HTTPS_PROXY pointing to the proxy
    And the child process environment has NODE_OPTIONS containing the proxy bootstrap
    And provider base URL overrides are set as fallback
    And the "universal" process is launched as a child process

  # ── Bonus: Env pre-seeding (C23) ─────────────────────────────────────────
  @medium
  @bonus
  Scenario: tank run with --prescan flag pre-seeds vault from environment
    Given environment variable "STRIPE_SECRET_KEY" is set to "sk_live_test123test456test789"
    And environment variable "AWS_SECRET_ACCESS_KEY" is set to "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
    When the user runs "tank run claude --prescan"
    Then the vault pre-registers 2 credentials from the environment
    And the proxy starts with those mappings already warm
    And the agent is launched normally

  # ── Clean shutdown (C21) ─────────────────────────────────────────────────
  @high
  Scenario: Agent exit triggers proxy shutdown and vault cleanup
    Given "tank run claude" is running with an active proxy and vault session
    When the agent process exits with code 0
    Then the proxy server shuts down
    And the session vault is cleared (0 mappings remain)
    And "tank run" exits with code 0

  @high
  Scenario: Agent killed with SIGINT triggers clean shutdown
    Given "tank run claude" is running with an active proxy and vault session
    When the user sends SIGINT (Ctrl+C)
    Then SIGINT is forwarded to the agent process
    And the proxy server shuts down after the agent exits
    And the session vault is cleared

  # ── Unknown agent (C22, E19) ─────────────────────────────────────────────
  @high
  Scenario: Unknown agent name produces helpful error
    When the user runs "tank run nonexistent-agent"
    Then the command fails with exit code 1
    And the error message contains "Unknown agent"
    And the error message lists supported agents including "claude", "opencode", "cursor", "codex", "openclaw", "universal"
    And no proxy is started

  # ── Edge cases ──────────────────────────────────────────────────────────
  @medium
  @edge-case
  Scenario: Agent crashes with non-zero exit code — proxy still cleans up
    Given "tank run claude" is running with an active proxy and vault session
    When the agent process exits with code 1
    Then the proxy server shuts down
    And the session vault is cleared
    And "tank run" exits with code 1 (forwarded from agent)

  @medium
  @edge-case
  Scenario: Agent killed with SIGTERM triggers clean shutdown
    Given "tank run claude" is running with an active proxy and vault session
    When the user sends SIGTERM
    Then SIGTERM is forwarded to the agent process
    And the proxy server shuts down after the agent exits
    And the session vault is cleared

  @medium
  @edge-case
  Scenario: Proxy port conflict — retries with a different port
    Given port 8484 is already in use by another process
    And the proxy initially attempts port 8484
    When the user runs "tank run claude"
    Then the proxy detects the port conflict
    And the proxy starts on a different available port
    And the agent is launched with the correct proxy URL

  @medium
  @edge-case
  Scenario: Agent binary not found in PATH
    Given "claude" is NOT available in PATH
    When the user runs "tank run claude"
    Then the command fails with exit code 1
    And the error message contains "not found" or "not installed"
    And no proxy is started

  @medium
  @edge-case
  Scenario: User has existing NODE_OPTIONS — tank appends, not overwrites
    Given environment variable "NODE_OPTIONS" is set to "--max-old-space-size=4096"
    When the user runs "tank run claude"
    Then the child process NODE_OPTIONS contains both "--max-old-space-size=4096" and the proxy bootstrap
    And the existing options are preserved

  @medium
  @edge-case
  Scenario: TANK_VAULT_DISABLE=1 bypasses the proxy entirely
    Given environment variable "TANK_VAULT_DISABLE" is set to "1"
    When the user runs "tank run claude"
    Then no proxy is started
    And the agent is launched directly without environment modifications
    And a warning is printed: "Vault disabled — credentials will not be redacted"

  @medium
  @edge-case
  Scenario: Multiple simultaneous tank run instances use different ports
    Given "tank run claude" is already running with proxy on port 9001
    When a second "tank run cursor" is started
    Then the second proxy starts on a different port (not 9001)
    And both agents run independently with their own vault sessions

  @low
  @edge-case
  Scenario: tank run with --verbose flag shows detailed proxy activity
    When the user runs "tank run claude --verbose"
    Then the output shows the proxy port
    And during operation when a credential is discovered in traffic, the output shows "[vault] discovered credential pattern: stripe_secret"
    And for each intercepted request, the output shows "[vault] redacted N credential(s) in outgoing request"
    And the output never shows real credential values
