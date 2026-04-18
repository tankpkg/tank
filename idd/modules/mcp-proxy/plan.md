# MCP Proxy — Phased Execution Plan

## Overview

**9 phases, each shippable.** Option A phase ordering: minimal audit ships in Phase 1
alongside the transport skeleton so detection phases can assert audit entries without
waiting for hardening. Audit hardening (hash chaining, canonicalization, rotation,
tamper tests) gets a dedicated Phase 4 once earlier detection phases have produced
real entries to harden.

Methodology per phase: RED (write failing BDD scenarios) → GREEN (implement until pass)
→ verify with `just lint && just test`. Every phase must keep earlier phases GREEN.

All BDD scenarios in this module are tagged `@mcp-proxy` plus per-scenario `@C<N>`
where `N` is the constraint ID from `INTENT.md`. Cross-reference: tags = constraints.

## Phase 0: Canary `_meta` Compatibility Spike (half-day, no PR)

**Goal:** Before locking canary placement in Phase 5, confirm `_meta.tank_canary`
injection does not break real MCP servers.

**Implementation:**

1. Write a disposable Bun script that launches 3 real MCPs as child processes:
   - `@modelcontextprotocol/server-filesystem`
   - `@modelcontextprotocol/server-everything` (swapped in from `server-fetch`, which is Python-only / not published to npm; `server-everything` is the official Node reference that exercises tools + resources + prompts in a single surface)
   - `@modelcontextprotocol/server-github`
2. Send a `tools/call` with `"_meta": {"tank_canary": "test123"}` injected.
3. Verify: (a) no server rejects the call, (b) no server echoes `_meta` into
   functional output in a way that breaks the caller, (c) response structure is
   unchanged vs. a baseline call without `_meta`.
4. Append a new decision entry in `idd/modules/mcp-proxy/decisions.md` (next available D-ID) recording the canary injection strategy (native `_meta.tank_canary` vs. out-of-band correlation table).
5. If any server rejects `_meta`, open follow-up issue and adopt the fallback
   (out-of-band correlation table keyed by JSON-RPC request ID) before Phase 5.

**Exit criteria:** Spike note recorded in `decisions.md` confirming injection
strategy. No code shipped from this phase.

---

## Phase 1: Transport + Minimal Audit (PR #1)

**Goal:** Transparent stdio proxy that forwards JSON-RPC without modification,
plus a minimal JSONL audit writer so later phases can assert audit entries.

**BDD features:** `transport.feature` (all `@high` scenarios), `audit-trail.feature`
(only `@phase-1` scenarios — basic pass-through logging, no hash chaining yet).

**Implementation:**

1. Scaffold `packages/proxy/` (package.json, tsconfig.json).
2. `src/transport/stdio-wrapper.ts` — spawn child process, pipe stdin/stdout.
3. `src/transport/message-router.ts` — parse JSON-RPC framing (Content-Length).
4. `packages/cli/src/commands/proxy.ts` — `tank proxy -- <command>` entry point.
5. Process lifecycle: exit code forwarding, SIGTERM/SIGINT propagation.
6. `src/audit/logger.ts` — **minimal** JSONL writer with the canonical minimal field set: `{timestamp, method, tool_name, verdict}`, plus optional `reason` field for blocked events (populated in Phase 2+ when scanners are wired in; empty/absent in Phase 1 pass-through). No hash chaining, no rotation, no canonicalization yet. Phase 4 hardens.
7. Move shared helpers per D7:
   - `packages/internals-helpers/src/credentials/` ← from `packages/vault/src/detector/`
     (with Shannon entropy gate added).
   - `packages/internals-helpers/src/permissions/` ← from `packages/sdk/src/install/permissions.ts`.
   - Vault + SDK get thin re-export shims; existing tests move with the code.

**Test matrix:**

| Scenario                               | Feature             | Tag             |
| -------------------------------------- | ------------------- | --------------- |
| E2E proxy wraps local MCP              | transport.feature   | @C1 @happy-flow |
| Identical interface with/without proxy | transport.feature   | @C1             |
| Child process lifecycle                | transport.feature   | @C2 @C5 @C6     |
| JSON-RPC framing                       | transport.feature   | @C4             |
| Malformed JSON handling                | transport.feature   | @edge-case      |
| Remote MCP connects upstream           | transport.feature   | @C3             |
| Pass-through call writes audit entry   | audit-trail.feature | @phase-1 @C35   |

**Dependencies:** `@modelcontextprotocol/sdk`, `mcp-proxy` (transport only).

**Exit criteria:** `tank proxy -- node mock-mcp-server.js` passes `tools/list`
and `tools/call` transparently. Every proxied message produces a JSONL audit
entry. All `@high` transport + `@phase-1` audit scenarios GREEN. Vault + SDK
tests still GREEN after the internals move.

---

## Phase 2: Tool Poisoning + Rug Pull Detection (PR #2)

**Goal:** Scan `tools/list` responses for hidden instructions and schema changes.

**BDD features:** `tool-poisoning.feature`, `rug-pull.feature` (all `@high`).

**Implementation:**

1. Port ClawGuard 216 regex patterns to `src/scanner/tool-poisoning.ts`.
2. `src/scanner/normalizer.ts` — zero-width strip, homoglyph decode, base64 decode.
3. `src/scanner/rug-pull.ts` — SHA-256 pinning of tool schemas over **canonicalized JSON**
   (sorted keys, no whitespace).
4. `src/policy/defaults.ts` — detection thresholds.
5. Pin storage: `~/.tank/proxy/pins/<package-hash>.json`.
6. Hook into message-router: intercept `tools/list` responses before returning to agent.
7. Audit entries for block/pass use the Phase 1 minimal writer.

**Test matrix:**

| Scenario                               | Feature                | Tag                  |
| -------------------------------------- | ---------------------- | -------------------- |
| Benign passes, poisoned blocked        | tool-poisoning.feature | @C7 @C11 @happy-flow |
| Evasion: zero-width, homoglyph, base64 | tool-poisoning.feature | @C9                  |
| Perf: <5ms per tools/list              | tool-poisoning.feature | @C10 @perf           |
| First connection pins schemas          | rug-pull.feature       | @C12 @happy-flow     |
| Description change triggers alert      | rug-pull.feature       | @C13                 |
| Reset pins                             | rug-pull.feature       | @C15                 |

**Port from OSS (MIT):**

- ClawGuard → 216 regex patterns + normalization pipeline.
- Aegis → SHA-256 hash pinning approach.

**Exit criteria:** Poisoned tools blocked by default. Schema changes detected.
All `@high` poisoning + rug-pull scenarios GREEN.

---

## Phase 3: Permission Enforcement (PR #3)

**Goal:** Enforce `tank.json` / `tank.lock` permissions at runtime for every
`tools/call`.

**BDD features:** `permission-enforcement.feature` (all `@high`, excluding the
deferred-C29 subprocess scenario).

**Implementation:**

1. `src/enforcer/permission-gate.ts` — load permissions via the CLI's manifest
   resolver (walks upward from cwd). **Precedence: `tank.lock` wins over `tank.json`
   when both are present** — the lockfile is the pinned, install-resolved source of
   truth at runtime (matches npm/bun/pnpm lockfile semantics). Falls back to
   `tank.json` only when no lockfile exists. Warns on legacy `skills.json` /
   `skills.lock` filenames.
2. `src/enforcer/domain-checker.ts` — thin wrapper over `@internals/helpers/permissions/isDomainAllowed`.
3. `src/enforcer/path-checker.ts` — thin wrapper over `@internals/helpers/permissions/isPathAllowed`.
   Canonicalizes inputs via `fs.realpath` before matching (defeats `../` and symlink bypass).
4. Recursive JSON argument traversal for URL/path extraction, depth-limited to 16.
5. Hook into message-router: intercept `tools/call` requests before forwarding.
6. Return JSON-RPC error `-32001` (`"tank: permission denied"`) for violations.

**Test matrix:**

| Scenario                               | Feature                        | Tag              |
| -------------------------------------- | ------------------------------ | ---------------- |
| Allowed domain passes                  | permission-enforcement.feature | @C27 @happy-flow |
| Blocked domain returns error           | permission-enforcement.feature | @C27 @C30        |
| Path canonicalized, traversal blocked  | permission-enforcement.feature | @C28             |
| Symlink outside allowed path blocked   | permission-enforcement.feature | @C28             |
| Descriptive error response             | permission-enforcement.feature | @C30             |
| No tank.json found = warn + allow      | permission-enforcement.feature | @C26a @edge-case |
| Depth-limited traversal (pathological) | permission-enforcement.feature | @C31 @edge-case  |

**Reuse from existing code (after D7 move):**

- `@internals/helpers/permissions` — domain/path matching functions.
- `@internals/schemas/permissions` — schema types.

**Deferred (C29 subprocess):** No BDD scenario, no implementation. Constraint
retained in INTENT.md with strikethrough marker.

**Exit criteria:** Undeclared domains and paths blocked at runtime. All `@high`
permission scenarios GREEN except the deferred C29 subprocess scenario.

---

## Phase 4: Audit Hardening (PR #4)

**Goal:** Upgrade the Phase 1 minimal audit writer to production-grade:
tamper-evident hash chaining, JSON canonicalization, log rotation.

**BDD features:** `audit-trail.feature` (all `@high` scenarios including tamper evidence).

**Implementation:**

1. Upgrade `src/audit/logger.ts`: SHA-256 hash of canonicalized previous entry
   appended to each new entry.
2. `src/audit/rotator.ts` — 10MB rotation, 5-file ring (`audit.jsonl`,
   `audit.jsonl.1`, ..., `audit.jsonl.5`).
3. Canonicalization: sorted keys, no whitespace, UTF-8 encoding, for both hashing
   and persistence.
4. Tamper test: mutate a middle entry, verify chain verification fails.

**Test matrix:**

| Scenario                            | Feature             | Tag              |
| ----------------------------------- | ------------------- | ---------------- |
| Tool call produces audit entry      | audit-trail.feature | @C35 @happy-flow |
| Hash chaining works                 | audit-trail.feature | @C36             |
| Tampered entry detected             | audit-trail.feature | @C36             |
| Canonicalized JSON is deterministic | audit-trail.feature | @C36             |
| No sensitive data in logs           | audit-trail.feature | @C37             |
| 10MB rotation, 5-file ring          | audit-trail.feature | @C38             |

**Build ourselves (trivial):**

- Hash chain: `crypto.createHash('sha256').update(canonicalJSON(prev)).digest('hex')`.
- JSONL rotation: `fs.stat` + `fs.rename`.

**Exit criteria:** Every tool call + resource + prompt interaction logged with
tamper-evident chain. Rotation tested. All `@high` audit scenarios GREEN.

---

## Phase 5: Canary Tokens (PR #5)

**Prerequisite:** Phase 0 spike complete, `_meta.tank_canary` confirmed safe.

**Goal:** Cross-tool exfiltration detection via unique injected markers.

**BDD features:** `canary-tokens.feature` (all `@high`).

**Implementation:**

1. `src/scanner/canary.ts` — generate canary (`crypto.randomBytes(8).toString('hex')`).
2. Canary injection into `_meta.tank_canary` field of tool call arguments.
3. Cross-tool canary leak detection in responses via in-memory session map
   keyed by canary value, value = `(source_tool, timestamp)`.
4. Session canaries do not persist across proxy restarts (no false positives
   from previous sessions).

**Test matrix:**

| Scenario                               | Feature               | Tag                   |
| -------------------------------------- | --------------------- | --------------------- |
| Canary injected, tool works normally   | canary-tokens.feature | @C19 @C22 @happy-flow |
| Each call gets unique canary           | canary-tokens.feature | @C19 @C20             |
| Cross-tool leak detected               | canary-tokens.feature | @C21                  |
| Self-echo is not an alert              | canary-tokens.feature | @C21                  |
| Canary injected into \_meta, not args  | canary-tokens.feature | @C22                  |
| Previous-session canary no false alert | canary-tokens.feature | @edge-case            |

**Exit criteria:** Canary leak detection working against mock MCPs that
echo data cross-tool. All `@high` canary scenarios GREEN.

---

## Phase 6: Adapter Rewriting + Integration (PR #6)

**Goal:** `tank install` automatically wraps MCP servers with proxy across all
6 adapters.

**BDD features:** `adapter-rewriting.feature` (all `@high`, `Scenario Outline`
covers all 6 agents).

**Implementation:**

1. `packages/cli/src/lib/adapter-rewriter.ts` — transform MCP config entries.
2. Modify all 6 adapters (claude, cursor, opencode, codex, openclaw, universal)
   to call adapter-rewriter during link step.
3. `--dangerously-no-tank-proxy` flag on `tank install`.
4. Remote MCP detection → `--remote` flag in proxy args, plus
   `TANK_MCP_AUTH_<slug>` env reference injection in agent config (C47).
5. Update adapter tests.

**Test matrix:**

| Scenario                          | Feature                   | Tag              |
| --------------------------------- | ------------------------- | ---------------- |
| Install rewrites to proxy         | adapter-rewriting.feature | @C42 @happy-flow |
| Opt-out flag works                | adapter-rewriting.feature | @C39             |
| Remote MCP wrapped + env var auth | adapter-rewriting.feature | @C3 @C47         |
| Missing auth env var fails loudly | adapter-rewriting.feature | @C48             |
| All 6 agents work                 | adapter-rewriting.feature | @Outline         |

**Exit criteria:** `tank install` produces proxy-wrapped configs by default for
all 6 agents. Opt-out works. Remote MCPs use env-var auth forwarding. All
`@high` adapter scenarios GREEN.

---

## Phase 7: Response Scanning + Resources/Prompts (PR #7)

**Goal:** Scan tool responses and `resources/*` / `prompts/*` for prompt
injection and credential leaks.

**BDD features:** `tool-poisoning.feature` (response scanning scenarios),
`resources-prompts.feature` (new file, all `@high`).

**Implementation:**

1. `src/scanner/prompt-injection.ts` — regex patterns on tool responses using
   the Phase 2 normalization pipeline.
2. `src/scanner/credential-leak.ts` — thin wrapper over
   `@internals/helpers/credentials/detector` (pattern match gated by Shannon
   entropy ≥ 4.5 bits/char).
3. `src/scanner/resources-prompts.ts` — scan `resources/list`, `resources/read`,
   `prompts/list`, `prompts/get` using the same normalization + pattern pipeline.
4. Hook into message-router: intercept responses for `tools/call`, `resources/*`,
   `prompts/*`.

**Test matrix:**

| Scenario                                      | Feature                   | Tag              |
| --------------------------------------------- | ------------------------- | ---------------- |
| Prompt injection in tool response blocked     | tool-poisoning.feature    | @C16 @C17        |
| Credential in response blocked (high entropy) | tool-poisoning.feature    | @C23 @C25 @C25a  |
| Low-entropy example string not flagged        | tool-poisoning.feature    | @C25a @edge-case |
| Response scanning <5ms                        | tool-poisoning.feature    | @C18 @perf       |
| Resource content scanned                      | resources-prompts.feature | @C32 @happy-flow |
| Prompt content scanned                        | resources-prompts.feature | @C33 @happy-flow |
| Credential in resource blocked                | resources-prompts.feature | @C32 @C23        |
| Same normalization pipeline applied           | resources-prompts.feature | @C34             |

**Exit criteria:** Tool responses, resources, and prompts scanned. Credential
leaks (entropy-gated) and prompt injection blocked. All `@high` scenarios GREEN.

---

## Phase 8: Tool Shadowing Detection (PR #8)

**Goal:** Detect cross-server tool name/description manipulation.

**BDD features:** `tool-shadowing.feature` (new file, all `@high`).

**Implementation:**

1. `src/scanner/shadow-detector.ts` — on every `tools/list`, append entries to
   shared registry file `~/.tank/proxy/registry.jsonl` keyed by
   `(server, tool_name, schema_hash)`.
2. Advisory file lock during registry writes (proper-lockfile or equivalent).
3. Detection: flag any tool whose name collides with another server's tool, or
   whose description references another server's tool by name (substring match
   on registered tool names).
4. Block shadowed tools by default; audit entry names both servers involved.
5. Registry entries expire 30 days after last observation (TTL cleanup on write).

**Test matrix:**

| Scenario                                     | Feature                | Tag                        |
| -------------------------------------------- | ---------------------- | -------------------------- |
| Two servers register same tool name → block  | tool-shadowing.feature | @C43 @C44 @C45 @happy-flow |
| Description references another server's tool | tool-shadowing.feature | @C44 @C45                  |
| Audit names both servers                     | tool-shadowing.feature | @C45                       |
| Registry TTL expires old entries             | tool-shadowing.feature | @C46 @edge-case            |
| Concurrent writes handled via file lock      | tool-shadowing.feature | @edge-case                 |

**Exit criteria:** Shadowing attacks detected across independently-running
proxy processes via the shared registry. All `@high` shadowing scenarios GREEN.

---

## Phase 9: ML Classifier Opt-in (PR #9)

**Goal:** Optional DeBERTa ONNX classifier for stronger prompt injection
detection.

**BDD features:** Extend `tool-poisoning.feature` and `resources-prompts.feature`
with `@ml` scenarios (gated, only run when model is installed).

**Implementation:**

1. `src/ml/classifier.ts` — DeBERTa ONNX wrapper.
2. `src/ml/download.ts` — interactive model download with size warning (~500MB).
3. `tank proxy --enable-ml` flag prompts download if model absent.
4. When enabled, ML runs in parallel with regex; alerts when either fires.

**Test matrix:**

| Scenario                           | Constraint |
| ---------------------------------- | ---------- |
| ML classifier download prompt      | @C41       |
| ML detects sophisticated injection | @C41 @ml   |
| ML disabled by default             | @C41       |

**Exit criteria:** Tool responses scanned. Credential leaks and prompt
injection blocked. ML classifier downloadable. All scenarios GREEN.

---

## Phase Summary

| Phase     | PR  | Deliverable                                | BDD Scenarios | Est. Effort     |
| --------- | --- | ------------------------------------------ | ------------- | --------------- |
| 0         | —   | Canary `_meta` compat spike                | 0 (manual)    | 0.5 day         |
| 1         | #1  | Transport + minimal audit + internals move | ~14           | 2-3 days        |
| 2         | #2  | Tool poisoning + rug pull                  | ~12           | 3-4 days        |
| 3         | #3  | Runtime permission gate                    | ~10           | 2-3 days        |
| 4         | #4  | Audit hardening                            | ~6            | 1-2 days        |
| 5         | #5  | Canary tokens                              | ~7            | 2 days          |
| 6         | #6  | Adapter rewriting (all 6 agents)           | ~8            | 2-3 days        |
| 7         | #7  | Response + resources/prompts               | ~10           | 2-3 days        |
| 8         | #8  | Tool shadowing (cross-proxy)               | ~6            | 2-3 days        |
| 9         | #9  | ML classifier opt-in                       | ~4            | 1-2 days        |
| **Total** |     |                                            | **~77**       | **~18-22 days** |

## Unresolved Questions

None — all 6 original open questions are resolved in `decisions.md` (D7–D11)
and the Phase 0 spike note. New questions raised during implementation should
be added here and resolved before their dependent phase begins.
