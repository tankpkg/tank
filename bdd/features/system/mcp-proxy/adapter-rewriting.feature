# Intent: idd/modules/mcp-proxy/INTENT.md
# Constraints covered: C39, C42, C47, C48
# Examples covered: E28, E29, E30

@mcp-proxy
@adapter
Feature: Adapter config rewriting — inject proxy wrapper into agent configs
  As a developer running "tank install"
  I need the adapter to automatically rewrite agent MCP configs to use the proxy wrapper
  So that all installed MCP servers are protected by default without manual configuration

  # ── Full happy flow ──────────────────────────────────────────────────────
  @high
  @happy-flow
  @C42
  @E28
  Scenario: tank install rewrites agent config to use proxy wrapper
    Given agent "claude" is detected
    When I run "tank install @org/mcp-tool"
    Then the Claude Code config at ".claude/settings.json" contains:
      """
      {
        "mcpServers": {
          "@org/mcp-tool": {
            "command": "tank",
            "args": ["proxy", "--", "npx", "@org/mcp-tool"]
          }
        }
      }
      """

  # ── Proxy enabled by default (C42) ────────────────────────────────────
  @high
  @C42
  Scenario: Proxy wrapping is the default — no flag needed
    When I run "tank install @org/tool"
    Then the agent config command is "tank" with args starting with "proxy"

  # ── Opt-out (C39) ─────────────────────────────────────────────────────
  @high
  @C39
  @E29
  Scenario: Opt-out skips proxy wrapping
    When I run "tank install @org/tool --dangerously-no-tank-proxy"
    Then the agent config uses the original command without proxy wrapper
    And a warning is logged: "Proxy disabled for @org/tool — MCP traffic will not be scanned"

  # ── Remote MCP handling with env-var auth forwarding (C47, E30) ───────
  @high
  @C47
  @E30
  Scenario: Remote MCP server is wrapped with --remote flag and env-var auth reference
    Given a skill "@org/remote-tool" declares a remote MCP server at "https://remote.example.com/sse"
    And the remote MCP requires auth
    When I run "tank install @org/remote-tool"
    Then the agent config contains:
      """
      {
        "command": "tank",
        "args": ["proxy", "--remote", "https://remote.example.com/sse"],
        "env": {
          "TANK_MCP_AUTH_REMOTE_TOOL": "<agent-config-resolves-this>"
        }
      }
      """
    And the env var name follows the pattern "TANK_MCP_AUTH_<PACKAGE_SLUG_UPPERCASED>"

  @high
  @C47
  Scenario: Remote MCP env-var slug is derived from package name
    Given a skill "@vendor/some-cool-tool" with a remote MCP
    When I run "tank install @vendor/some-cool-tool"
    Then the env var name is "TANK_MCP_AUTH_SOME_COOL_TOOL"
    And non-alphanumeric characters in the slug are replaced with "_"
    And the scope "@vendor/" prefix is stripped before derivation

  @high
  @C47
  Scenario: Proxy forwards env-var auth as Authorization header at startup
    Given the agent launches the proxy with TANK_MCP_AUTH_REMOTE_TOOL="Bearer xyz-token"
    When the proxy connects to the SSE/HTTP upstream
    Then the proxy attaches "Authorization: Bearer xyz-token" to upstream requests
    And the auth value is never written to disk or logs

  @high
  @C48
  @fail-loud
  Scenario: Missing auth env var causes proxy to fail loud (C48)
    Given the remote MCP requires auth
    And TANK_MCP_AUTH_REMOTE_TOOL is not set in the environment
    When the proxy starts
    Then the proxy exits with code 2
    And stderr contains "tank proxy: required auth env var TANK_MCP_AUTH_REMOTE_TOOL not set"
    And the proxy does NOT connect to the upstream

  # ── All 6 adapters (extended from 3 per D6) ──────────────────────────
  @high
  @C39
  @C42
  Scenario Outline: Proxy wrapping works for all 6 supported agents
    Given agent "<agent>" is detected
    When I run "tank install @org/mcp-tool"
    Then the "<config_file>" MCP server entry uses proxy wrapping
    And the entry command is "tank" with args ["proxy", "--", "npx", "@org/mcp-tool"]

    Examples:
      | agent     | config_file                 |
      | claude    | .claude/settings.json       |
      | cursor    | ~/.cursor/mcp.json          |
      | opencode  | ~/.config/opencode/mcp.json |
      | codex     | ~/.codex/config.json        |
      | openclaw  | ~/.openclaw/mcp.json        |
      | universal | ~/.config/mcp/servers.json  |

  # ── Edge cases ─────────────────────────────────────────────────────────
  @medium
  @edge-case
  @C39
  Scenario: Existing non-proxy config is upgraded to proxy on reinstall
    Given agent "claude" has an existing config with direct MCP server command
    When I run "tank install @org/mcp-tool" (reinstall)
    Then the config is updated to use the proxy wrapper
    And the original command is preserved as the proxied command

  @medium
  @edge-case
  @C39
  Scenario: tank binary not in PATH — config uses full path to tank
    Given "tank" is not in the system PATH
    And the tank binary is at "/usr/local/bin/tank"
    When I run "tank install @org/tool"
    Then the agent config uses "/usr/local/bin/tank" as the command

  @medium
  @edge-case
  @C39
  Scenario: Opt-out still works for all 6 adapters
    When I run "tank install @org/tool --dangerously-no-tank-proxy" for each adapter
    Then every adapter config writes the original command without proxy wrapper
    And every adapter logs the same "Proxy disabled" warning
