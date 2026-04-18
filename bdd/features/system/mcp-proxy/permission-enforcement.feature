# Intent: idd/modules/mcp-proxy/INTENT.md
# Constraints covered: C26, C26a, C27, C28, C29 (deferred), C30, C31

@mcp-proxy
@permissions
Feature: Runtime permission enforcement — block unauthorized tool calls
  As the Tank MCP proxy
  I need to enforce declared permissions from tank.json / tank.lock at runtime
  So that MCP servers cannot exceed their declared permission budget
  even if the static scanner missed something or the server is remote

  Background:
    Given the proxy is running with a child MCP server
    And the project has a tank.json with permissions:
      """
      {
        "permissions": {
          "network": { "outbound": ["*.stripe.com", "api.github.com"] },
          "filesystem": { "read": ["./src/**", "./README.md"], "write": ["./output/**"] },
          "subprocess": false
        }
      }
      """

  # ── Full happy flow ──────────────────────────────────────────────────────
  @high
  @happy-flow
  @C26
  @C27
  Scenario: Tool call within permission budget is forwarded
    When the agent calls tool "fetch_api" with arguments {"url": "https://api.stripe.com/v1/charges"}
    Then the proxy checks the URL against the network.outbound allowlist
    And the domain "api.stripe.com" matches "*.stripe.com"
    And the call is forwarded to the MCP server
    And the tool result is returned to the agent

  # ── Network enforcement (C27) ──────────────────────────────────────────────
  @high
  @C27
  Scenario: Tool call to allowed wildcard domain passes
    When the agent calls tool "fetch_api" with arguments {"url": "https://dashboard.stripe.com/api/v1/events"}
    Then the domain "dashboard.stripe.com" matches "*.stripe.com"
    And the call is forwarded

  @high
  @C27
  Scenario: Tool call to allowed exact domain passes
    When the agent calls tool "fetch_api" with arguments {"url": "https://api.github.com/repos"}
    Then the domain "api.github.com" matches "api.github.com"
    And the call is forwarded

  @high
  @C27
  @C30
  Scenario: Tool call to undeclared domain is blocked
    When the agent calls tool "fetch_api" with arguments {"url": "https://evil.com/exfiltrate"}
    Then the proxy blocks the call with a JSON-RPC error
    And the error message contains "domain_not_allowed" and "evil.com"
    And the audit log contains a "block" entry for "fetch_api"
    And the call is NOT forwarded to the MCP server

  @high
  @C27
  @C31
  Scenario: Tool call with URL in nested argument is checked (recursive traversal)
    When the agent calls tool "webhook" with arguments {"config": {"endpoint": "https://attacker.io/hook"}}
    Then the proxy recursively inspects arguments for URLs up to depth 16
    And blocks the call with "domain_not_allowed" for "attacker.io"

  @medium
  @C31
  @edge-case
  Scenario: Recursive traversal is bounded at depth 16 to prevent pathological payloads
    Given a tool call with arguments nested 20 levels deep containing a URL at depth 18
    When the agent issues the call
    Then the proxy stops traversal at depth 16
    And does not crash or hang on the pathological payload
    And logs a warning "traversal_depth_exceeded"

  # ── Filesystem enforcement (C28) ───────────────────────────────────────
  @high
  @C28
  Scenario: Tool call to read from allowed path passes
    When the agent calls tool "read_file" with arguments {"path": "./src/index.ts"}
    Then the proxy canonicalizes "./src/index.ts" via realpath
    And the canonicalized path matches "./src/**"
    And the call is forwarded

  @high
  @C28
  @C30
  Scenario: Tool call to read from disallowed path is blocked
    When the agent calls tool "read_file" with arguments {"path": "/etc/passwd"}
    Then the proxy blocks the call with "path_not_allowed"
    And the call is NOT forwarded to the MCP server

  @high
  @C28
  Scenario: Tool call to write to allowed output path passes
    When the agent calls tool "write_file" with arguments {"path": "./output/result.json", "content": "{}"}
    Then the proxy canonicalizes "./output/result.json" via realpath
    And the canonicalized path matches "./output/**"
    And the call is forwarded

  @high
  @C28
  @C30
  Scenario: Tool call to write outside allowed paths is blocked
    When the agent calls tool "write_file" with arguments {"path": "./src/index.ts", "content": "malicious"}
    Then the proxy blocks the call because "./src/index.ts" is not in filesystem.write
    And the error message contains "path_not_allowed"

  @high
  @C28
  @path-canonicalization
  Scenario: Path traversal attempt is canonicalized and blocked (E16)
    When the agent calls tool "read_file" with arguments {"path": "./src/../../etc/passwd"}
    Then the proxy canonicalizes the path via realpath
    And the canonicalized path resolves to "/etc/passwd"
    And the call is blocked with "path_not_allowed"

  @high
  @C28
  @path-canonicalization
  Scenario: Symlink escape attempt is canonicalized and blocked (E17)
    Given a symlink "./src/escape" pointing to "/etc/shadow"
    When the agent calls tool "read_file" with arguments {"path": "./src/escape"}
    Then the proxy follows the symlink via realpath
    And the canonicalized path resolves to "/etc/shadow"
    And the call is blocked with "path_not_allowed"
    And the audit log contains reason "symlink_escape"

  # ── Subprocess enforcement (C29 — DEFERRED to v2) ──────────────────────
  # C29 is explicitly deferred per decisions.md D9. Runtime subprocess
  # detection requires ptrace/seccomp/DTrace — out of scope for a JSON-RPC
  # proxy. The static scanner already flags subprocess spawning at install
  # time. The scenario below is kept as a placeholder and marked @deferred.
  @deferred
  @v2
  @C29
  Scenario: Subprocess call enforcement (DEFERRED — not shipped in v1)
    Given C29 is deferred per INTENT.md and decisions.md D9
    When the agent calls tool "run_command" with arguments {"command": "rm -rf /"}
    Then v1 does NOT enforce this at runtime
    And the static scanner is responsible for flagging subprocess spawning at install time
    # v2 implementation note: revisit when kernel-level hooks become in-scope

  # ── Error responses (C30) ──────────────────────────────────────────────
  @high
  @C30
  Scenario: Permission violation returns descriptive JSON-RPC error
    When the agent calls tool "fetch_api" with arguments {"url": "https://evil.com/steal"}
    Then the proxy returns a JSON-RPC error response
    And the error code is -32001
    And the error message contains "tank: permission denied"
    And the error data contains "domain_not_allowed", "evil.com", and the allowed domains

  # ── No permissions declared (C26a) ─────────────────────────────────────
  @medium
  @C26a
  @fail-open
  Scenario: No tank.json or tank.lock found — proxy warns but allows all
    Given no tank.json or tank.lock exists in the project (walking upward from cwd)
    When the agent calls tool "fetch_api" with arguments {"url": "https://any.com/api"}
    Then the proxy logs a warning "No permission budget found — all calls allowed"
    And the call is forwarded
    And the fail-open behavior is audited

  @medium
  @C26
  Scenario: Proxy walks upward from cwd to find tank.json
    Given the project root is "/workspace/app"
    And tank.json lives at "/workspace/app/tank.json"
    And the proxy is invoked from "/workspace/app/packages/sub/deep"
    When the proxy starts
    Then the proxy walks upward from cwd
    And loads "/workspace/app/tank.json" as the permission source

  @medium
  @C26
  Scenario: Proxy prefers tank.lock over tank.json when both exist
    Given both tank.json and tank.lock exist in the project
    When the proxy starts
    Then the proxy loads tank.lock as the permission source (stricter, pinned)
    And tank.json is used only as a fallback

  # ── Edge cases ─────────────────────────────────────────────────────────
  @medium
  @edge-case
  @C27
  Scenario: Tool arguments contain no URLs or paths — no permission check needed
    When the agent calls tool "calculate" with arguments {"a": 1, "b": 2}
    Then no permission check is performed
    And the call is forwarded immediately

  @medium
  @edge-case
  @C27
  Scenario: Tool arguments contain multiple URLs — all must be allowed
    When the agent calls tool "multi_fetch" with arguments {"urls": ["https://api.stripe.com/v1", "https://evil.com/steal"]}
    Then the proxy blocks the call because "evil.com" is not allowed
    Even though "api.stripe.com" is allowed
