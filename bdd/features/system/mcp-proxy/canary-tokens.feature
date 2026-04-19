# Intent: idd/modules/mcp-proxy/INTENT.md
# Constraints covered: C19, C20, C21, C22
# Prerequisite: Phase 0 compatibility spike against 3 real MCP servers
#               (filesystem, fetch, github) — see INTENT.md "Phase 0 compatibility spike"
#               MUST complete before this feature's scenarios can ship.
#               Fallback if _meta injection fails: out-of-band correlation table
#               keyed by JSON-RPC request ID.

@mcp-proxy
@canary
Feature: Canary token injection — detect cross-tool data exfiltration
  As the Tank MCP proxy
  I need to inject unique canary tokens into tool call metadata at `_meta.tank_canary`
  So that if a tool leaks data to another tool or external service
  the leak is detected via the canary appearing where it shouldn't

  Background:
    Given the Phase 0 compatibility spike has confirmed `_meta.tank_canary` injection does not break the 3 real MCP servers (filesystem, fetch, github)
    And the proxy is running with a child MCP server
    And the MCP server registers tools "tool_a" and "tool_b"

  # ── Full happy flow ──────────────────────────────────────────────────────
  @high
  @happy-flow
  @C19
  @C20
  @C22
  @E18
  Scenario: Canary injected into _meta.tank_canary, tool works normally
    When the agent calls tool "tool_a" with arguments {"path": "./file.txt"}
    Then the proxy injects a unique canary token at "_meta.tank_canary"
    And the tool receives the call with the canary at "_meta.tank_canary"
    And the tool executes normally (canary does not affect functional arguments)
    And the tool result is returned to the agent

  # ── Canary generation (C20) ────────────────────────────────────────────
  @high
  @C20
  Scenario: Canary token format — crypto.randomBytes(8).toString('hex')
    When the proxy generates a canary
    Then the canary is 16 hex characters (8 random bytes)
    And the canary is cryptographically random (uses crypto.randomBytes)

  @high
  @C20
  Scenario: Each tool call gets a unique canary
    When the agent calls tool "tool_a" twice
    Then each call has a different canary token at "_meta.tank_canary"
    And the tokens do not collide within the same proxy session

  @high
  @C20
  @placement
  Scenario: Canary is always placed at _meta.tank_canary — not _meta.canary
    When the proxy injects a canary
    Then the injection path is exactly "_meta.tank_canary"
    And no other "_meta.*" key is modified
    And existing "_meta" keys are preserved

  # ── Exfiltration detection (C21) ───────────────────────────────────────
  @high
  @C21
  @E19
  Scenario: Canary from tool_a appears in tool_b response — exfiltration detected
    Given the proxy injected canary "abc123def4567890" into tool_a's "_meta.tank_canary"
    When tool_b's response contains "abc123def4567890"
    Then the proxy fires an exfiltration alert
    And the response is blocked with reason "canary_leak_detected"
    And the audit log contains an entry identifying source tool "tool_a" and leaking tool "tool_b"

  @high
  @C21
  @E20
  Scenario: Canary from tool_a appears in tool_a's own response — normal (not an alert)
    Given the proxy injected canary "abc123def4567890" into tool_a's "_meta.tank_canary"
    When tool_a's response contains "abc123def4567890"
    Then no exfiltration alert fires (tool echoing its own metadata is expected)
    And the response passes through

  @high
  @C21
  Scenario: Canary appears in tool_b's outbound URL argument — cross-tool exfiltration
    Given the proxy injected canary "beefcafe12345678" into tool_a's "_meta.tank_canary"
    When the agent subsequently calls tool_b with arguments containing "beefcafe12345678" in a URL
    Then the proxy blocks the call with reason "canary_leak_detected"
    And the audit log links tool_a (source) and tool_b (consumer)

  # ── Non-functional injection (C22) ─────────────────────────────────────
  @high
  @C22
  Scenario: Canary injection does not modify functional arguments
    When the agent calls tool "read_file" with arguments {"path": "./README.md"}
    Then the proxy injects the canary at "_meta.tank_canary", not into "path"
    And the tool receives functional arguments {"path": "./README.md"} unchanged

  @high
  @C22
  Scenario: Arguments without existing _meta get a new _meta object
    When the agent calls tool "simple_tool" with arguments {"input": "hello"}
    Then the proxy adds "_meta": {"tank_canary": "<token>"} to the arguments
    And the tool receives {"input": "hello", "_meta": {"tank_canary": "<token>"}}

  @high
  @C22
  Scenario: Arguments with pre-existing _meta object — tank_canary is merged
    When the agent calls tool "tool_x" with arguments {"input": "hi", "_meta": {"progress_token": "p1"}}
    Then the proxy adds "tank_canary" alongside the existing "progress_token"
    And the tool receives {"input": "hi", "_meta": {"progress_token": "p1", "tank_canary": "<token>"}}

  # ── Edge cases ─────────────────────────────────────────────────────────
  @medium
  @C21
  @edge-case
  Scenario: Canary from a previous session does not trigger false positive
    Given a canary "old_canary_1234567" from a previous proxy session
    When tool_b's response contains "old_canary_1234567"
    Then no alert fires (canary is not from current session's active set)

  @medium
  @C20
  @edge-case
  Scenario: Canary session cache is bounded (no unbounded memory growth)
    Given the proxy has been running for 24 hours with 100k tool calls
    When the canary cache is inspected
    Then the cache is bounded (eviction policy applied, e.g. LRU with cap)
    And canaries older than a TTL (e.g. 1 hour) are eligible for eviction


# ── Phase 0 fallback note (documented, not automated) ──────────────────
# If the Phase 0 spike reveals that `_meta.tank_canary` breaks a real MCP
# server, the fallback (per INTENT.md) is:
#   - Do NOT inject into arguments.
#   - Maintain an out-of-band correlation table keyed by JSON-RPC request ID.
#   - Correlate tool_a's call to tool_b's response via request ID ancestry.
# A dedicated scenario set will be written at that time; not specified here.