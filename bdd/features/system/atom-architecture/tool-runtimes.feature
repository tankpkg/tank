# Intent: idd/modules/atom-architecture/INTENT.md
# Layer: Examples E24-E27 (issue #453)
# Executable verification: packages/adapters/src/__tests__/tool-runtimes.test.ts

@atom-architecture
@mcp
Feature: Non-Node MCP tool atoms compile to real client config
  As a skill author publishing a Python (uvx) or other non-Node MCP server
  I need Tank adapters to emit usable MCP config for OpenCode, Claude Code,
  Cursor, Windsurf, Cline, and Roo Code
  So that my tool registers with the AI agent instead of being silently
  dropped as instruction-only.

  @high
  Scenario: Tool atom with mcp.runtime "uvx" compiles to uvx command (E24)
    Given a tool atom { name: "web-search", mcp: { runtime: "uvx", package: "web-search-mcp" } }
    When the OpenCode adapter compiles it
    Then a single file is written at ".opencode/mcp/web-search.json"
    And the file's "smoke-search.command" is ["uvx", "web-search-mcp"]
    And no warnings are emitted

  @high
  Scenario: Tool atom with mcp.runtime "npx" prepends "-y" for non-interactive use (E25)
    Given a tool atom { name: "tool-x", mcp: { runtime: "npx", package: "my-mcp", args: ["--flag"] } }
    When the Claude Code adapter compiles it
    Then ".mcp.json" contains command "npx" and args ["-y", "my-mcp", "--flag"]

  @high
  Scenario: extensions.<adapter> bag provides MCP command when no canonical mcp block (E26)
    Given a tool atom whose only config is extensions.opencode = { command: "uvx", args: ["memory-mcp"], env: { KEY: "x" } }
    When the OpenCode adapter compiles it
    Then ".opencode/mcp/memory.json" contains command ["uvx", "memory-mcp"]
    And the file contains environment { KEY: "x" }
    And NO "has no MCP config" warning is emitted

  @medium
  Scenario: A tool with neither mcp nor matching extensions still emits a skipped warning (E27)
    Given a tool atom with no mcp block and no extensions.opencode
    When the OpenCode adapter compiles it
    Then no files are written
    And exactly one skipped warning is emitted

  @medium
  Scenario: Extension bag is adapter-scoped — extensions.cursor does not affect opencode
    Given a tool atom with only extensions.cursor = { command: "uvx", args: ["x"] }
    When the OpenCode adapter compiles it
    Then no files are written
    And a skipped warning is emitted
