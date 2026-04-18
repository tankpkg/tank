# Intent: idd/modules/mcp-proxy/INTENT.md
# Constraints covered: C1, C2, C3, C4, C5, C6

@mcp-proxy
@transport
Feature: MCP proxy transport — transparent stdio wrapper
  As an AI agent developer
  I need Tank to transparently proxy MCP server traffic via a wrapper process
  So that all JSON-RPC messages pass through the security scanner
  without changing the agent's interface or requiring any agent-side configuration

  Background:
    Given a mock MCP server that registers tools "read_file" and "write_file"
    And the mock server uses stdio transport

  # ── Full happy flow ──────────────────────────────────────────────────────
  @high
  @happy-flow
  @C1
  @C2
  @C4
  Scenario: End-to-end — proxy wraps a local MCP server transparently
    When I start the proxy with "tank proxy -- node mock-mcp-server.js"
    And the agent sends a JSON-RPC "tools/list" request via stdin
    Then the proxy forwards the request to the child MCP server
    And the proxy returns the tools list response to the agent via stdout
    And the response contains tools "read_file" and "write_file"
    When the agent sends a "tools/call" request for tool "read_file" with arguments {"path": "./README.md"}
    Then the proxy forwards the call to the child MCP server
    And the proxy returns the tool result to the agent via stdout
    And the tool result contains the file content

  # ── Stdio transparency (C1) ──────────────────────────────────────────────
  @high
  @C1
  Scenario: Agent sees identical interface with and without proxy
    Given the agent connects directly to the MCP server via stdio
    And records the "tools/list" response as "direct_response"
    When the agent connects through "tank proxy -- node mock-mcp-server.js"
    And sends the same "tools/list" request
    Then the tool names and schemas in both responses are identical

  # ── Child process lifecycle (C2, C5, C6) ─────────────────────────────────
  @high
  @C2
  Scenario: Proxy spawns MCP server as child process
    When I start the proxy with "tank proxy -- node mock-mcp-server.js"
    Then the child process "node mock-mcp-server.js" is running
    And the proxy process is running
    And the proxy's stdin is connected to the child's stdin
    And the proxy's stdout receives the child's stdout

  @high
  @C5
  Scenario: Proxy exits with same code when child exits
    Given the proxy is running with a child MCP server
    When the child MCP server exits with code 1
    Then the proxy exits with code 1

  @high
  @C5
  Scenario: Proxy exits with code 0 when child exits cleanly
    Given the proxy is running with a child MCP server
    When the child MCP server exits with code 0
    Then the proxy exits with code 0

  @high
  @C6
  Scenario: Killing proxy terminates child process (SIGTERM)
    Given the proxy is running with a child MCP server
    When the proxy receives SIGTERM
    Then the proxy sends SIGTERM to the child process
    And both processes exit within 5 seconds

  @high
  @C6
  Scenario: Killing proxy with SIGINT terminates child process
    Given the proxy is running with a child MCP server
    When the proxy receives SIGINT
    Then the proxy sends SIGTERM to the child process
    And both processes exit within 5 seconds

  # ── Remote MCP transport (C3) ───────────────────────────────────────────
  @high
  @C3
  Scenario: Proxy connects to remote MCP server via SSE
    Given a mock remote MCP server running at "http://localhost:9999/sse"
    When I start the proxy with "tank proxy --remote http://localhost:9999/sse"
    And the agent sends a JSON-RPC "tools/list" request via stdin
    Then the proxy forwards the request to the remote server via SSE
    And returns the response to the agent via stdout

  @high
  @C3
  Scenario: Proxy connects to remote MCP server via HTTP
    Given a mock remote MCP server running at "http://localhost:9999/mcp"
    When I start the proxy with "tank proxy --remote http://localhost:9999/mcp"
    And the agent sends a JSON-RPC "tools/list" request via stdin
    Then the proxy forwards the request to the remote server via HTTP POST
    And returns the response to the agent via stdout

  # ── JSON-RPC framing (C4) ──────────────────────────────────────────────
  @high
  @C4
  Scenario: Proxy handles JSON-RPC message framing correctly
    When the agent sends a properly framed JSON-RPC 2.0 request via stdin
    Then the proxy parses the Content-Length header
    And reads exactly that many bytes for the message body
    And forwards a properly framed JSON-RPC 2.0 message to the child

  @medium
  @C4
  @edge-case
  Scenario: Proxy handles malformed JSON-RPC gracefully
    When the agent sends invalid JSON via stdin
    Then the proxy returns a JSON-RPC error response with code -32700 (Parse error)
    And the proxy remains running for subsequent requests

  @medium
  @C4
  @edge-case
  Scenario: Proxy handles rapid sequential requests
    When the agent sends 50 "tools/call" requests in rapid succession
    Then all 50 responses are returned in order
    And no responses are lost or corrupted

  @medium
  @C5
  @edge-case
  Scenario: Child process crashes — proxy reports error and exits
    Given the proxy is running with a child MCP server
    When the child process crashes unexpectedly (SIGSEGV)
    Then the proxy returns an error to any pending requests
    And the proxy exits with a non-zero code
