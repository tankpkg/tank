# MCP Proxy — Decisions Log

## D1: Proxy lifecycle model

**Question:** Per-tool wrapper process vs. single daemon vs. hybrid?

**Decision:** Wrapper process. Each MCP server gets its own `tank proxy` process.

**Rationale:**

- No daemon management (start/stop/health)
- Crash isolation — one proxy crash doesn't kill all MCPs
- Natural stdio fit — agent connects to proxy stdin/stdout
- Proven pattern (Microsoft AGT MCPProxy uses this model)
- Remote MCPs work too — proxy connects upstream as SSE/HTTP client
- Cross-server analysis done via shared registry file (see D10 / C43–C46)

## D2: Default strictness

**Question:** Block detected threats by default, or warn-only?

**Decision:** Block by default. User can allowlist per-tool.

**Rationale:** Tank's security-first positioning. Advisory permissions that
don't enforce are theater. Block + allowlist is safer than warn + opt-in.

## D3: ML classifier scope

**Question:** Include DeBERTa ONNX (~500MB) for prompt injection detection in v1?

**Decision:** Optional add-on. Ship regex-only by default, user prompted to
download ML classifier if desired (`tank proxy --enable-ml`).

**Rationale:** ~500MB download is a heavy ask for default installs. Regex
patterns cover 98.3% F1 from ClawGuard. ML as opt-in upgrade path.

## D4: Technology choice

**Question:** Bun/TypeScript vs. Rust vs. Go for proxy performance?

**Decision:** Bun/TypeScript. Same as the rest of the Tank monorepo.

**Rationale:**

- Proxy is long-running — startup cost paid once (~20ms Bun)
- Per-message overhead is <5ms for regex + hash + entropy checks (conservative ceiling)
- MCP server execution (network, I/O) is 10-1000ms — proxy is noise
- Same build system, CI, language, maintainers
- Bun FFI to Rust for regex hot path if ever needed (not v1)

## D5: Relationship to Vault

**Question:** Extend Vault module or separate package?

**Decision:** Separate `packages/proxy/` package. Shares credential detection
patterns from Vault via `@internals/helpers` imports, but distinct responsibility.
See D7 for the shared-code boundary.

**Rationale:**

- Vault = credential proxy between agent and AI provider (HTTP traffic)
- Proxy = security proxy between agent and MCP server (JSON-RPC traffic)
- Different transport, different threat model, different interception points
- Shared code is factored out to `@internals/helpers` — neither imports the other directly

## D6: OSS foundation

**Question:** Build from scratch or use mcp-proxy npm package?

**Decision:** Use `mcp-proxy` for transport primitives, custom security layer.

**Rationale:**

- `mcp-proxy` (407K DLs, MIT) provides `proxyServer()` with full transport
  support (stdio, SSE, HTTP). Custom `setRequestHandler` enables interception.
- `tapTransport()` is observe-only — insufficient for enforcement
- Security scanning, policy enforcement, audit — all custom on top
- Microsoft AGT MCPProxy is reference only (stdio-only, not a library)

## D7: Shared-code ownership

**Question:** Credential patterns currently live in `packages/vault/src/detector/`;
permission matchers (`isDomainAllowed`, `isPathAllowed`) currently live in
`packages/sdk/src/install/permissions.ts`. The proxy needs both. Should the proxy
import from Vault/SDK, or should the shared code move to `@internals/*`?

**Decision:** Move shared code to `@internals/helpers` (runtime) and
`@internals/schemas` (types). Vault, SDK, and Proxy all import from internals.
No package imports another package directly.

**Rationale:**

- AGENTS.md explicitly forbids cross-package imports outside `@internals/*`
- Three consumers (Vault, SDK, Proxy) need the same credential + permission logic;
  centralizing prevents drift
- Moving is a small refactor — 2 files (~200 LOC) with existing tests that move with them
- New capability (Shannon entropy gate) added once in internals, available to all three

**Implementation notes:**

- `packages/internals-helpers/src/credentials/` ← from `packages/vault/src/detector/`
- `packages/internals-helpers/src/permissions/` ← from `packages/sdk/src/install/permissions.ts`
- Vault's `detector.ts` becomes a thin re-export for backward compat
- SDK's `permissions.ts` becomes a thin re-export for backward compat
- Tests move with the code; re-export modules get smoke tests

## D8: Per-tool policy override layering

**Question:** User asked for per-tool overrides (C40, originally C36) to live in
**both** `~/.tank/proxy/policy.json` (user-global) and project-level `tank.json`.
Which wins on conflict?

**Decision:** **Project overrides user-global.** Merge is deep; on leaf-level
conflict, the value from `tank.json` replaces the value from `~/.tank/proxy/policy.json`.

**Rationale:**

- Team consistency: if a repo declares `@org/tool.scan: true`, every developer on
  the team gets scanning regardless of their personal preferences
- Principle of least privilege at the tightest scope
- Mirrors how most tools layer config (git config `--local` > `--global`)
- Explicit opt-outs remain possible at project level; user-global is the safety net

**Implementation:** `packages/proxy/src/policy/loader.ts` does a `deepMerge(userGlobal, project)`
where `project` is the RHS (wins on conflict).

## D9: C29 (runtime subprocess enforcement) deferred to v2

**Question:** Original INTENT.md C29 required the proxy to block `tools/call`
arguments that would spawn subprocesses when `subprocess: false` is declared.
User decision: drop from v1 — subprocess is a static-scanner concern.

**Decision:** **C29 is not implemented in v1.** The constraint is retained in the
INTENT.md table with a strikethrough marker and a `DEFERRED to v2` note so the gap
stays visible. No BDD scenario, no implementation file. Static scanner at install
time is the v1 control.

**Rationale:**

- Reliable runtime subprocess detection requires kernel-level hooks (ptrace on
  Linux, DTrace on macOS, seccomp filters) — out of scope for a JSON-RPC proxy
- Argument inspection alone is insufficient: tools can spawn processes via
  FFI, `exec`, opaque libraries, or indirect invocation — pattern matching gives
  false confidence
- Static scanner already flags subprocess APIs in skill source code at install time
- Keeping the constraint visible (not deleted) documents the gap for future work

**Follow-up:** Separate initiative "MCP proxy v2 — kernel enforcement" tracks
runtime subprocess blocking. Out of scope for this module.

## D10: Tool shadowing detection — dedicated phase

**Question:** Tool shadowing needs cross-server state. Fold into an existing
phase or give it its own?

**Decision:** **Dedicated Phase 8.** Separate `registry.jsonl`, separate
scanner module, separate BDD feature file (`tool-shadowing.feature`).

**Rationale:**

- Cross-proxy state is the most complex addition in the module (shared file,
  locking, TTL expiry)
- Dedicated phase keeps Phase 7 (response scanning + resources/prompts) tight
- Clean dependency chain: transport → detection → enforcement → audit → canary →
  adapter → response scanning → shadowing → ML
- Phase boundary = PR boundary — easier to review independently

## D11: Resources and prompts scanning — dedicated BDD feature

**Question:** Scanning `resources/*` and `prompts/*` methods: extend
`tool-poisoning.feature` or new file?

**Decision:** **New file `resources-prompts.feature`.** Same detection logic,
different entry points.

**Rationale:**

- `tool-poisoning.feature` stays focused on `tools/list` scanning
- `resources/*` and `prompts/*` are logically parallel concerns — deserve their
  own Gherkin feature header and grouping
- Easier to run in isolation: `just test bdd -- --tags @resources-prompts`
- Detection pipeline is shared via `normalizer.ts` + pattern imports — no
  logic duplication even though the feature file is separate

---

## D12: Canary injection via `_meta.tank_canary` — validated by Phase 0 spike

**Question:** Should Tank inject its canary token natively inside the JSON-RPC
message (`params._meta.tank_canary`) or maintain an out-of-band correlation
table keyed by request ID?

**Decision:** **Native `_meta.tank_canary` injection.** Tank generates a
16-hex-character token via `crypto.randomBytes(8).toString("hex")` and places
it at `params._meta.tank_canary` on every outbound request to downstream MCP
servers. Satisfies C16.

**Rationale:**

- `_meta` is the MCP protocol's reserved passthrough field — servers are
  contractually required to ignore unknown keys inside it
- Native injection is O(1) and allocation-free on the hot path (no external
  correlation map, no lookup per response)
- Phase 0 empirical validation (see Evidence below) proved all three probed
  servers accept `_meta.tank_canary` without error, return shape-equal results
  vs. baseline, and do not echo the token in their response
- Keeps the proxy stateless on canary tracking — no in-memory table to size,
  evict, or lock

**Evidence (Phase 0 spike, disposable workspace at `/tmp/tank-phase0-spike/`):**

Spike script sent paired requests (baseline without canary, probe with
`_meta.tank_canary`) to `initialize` and `tools/list` against three real
upstream servers using stdio JSON-RPC. Pass criteria: (1) no JSON-RPC error
on canary request, (2) shape-equal `result` keys between baseline and probe,
(3) canary token does not appear in response serialization.

Run artifacts:

- Canary token generated for this run: `b48df6275cdf8f2b`
- `@modelcontextprotocol/server-filesystem` — initialize + tools/list:
  baseline=ok canary=ok shape=eq leak=false — verdict **PASS**
- `@modelcontextprotocol/server-everything` — initialize + tools/list:
  baseline=ok canary=ok shape=eq leak=false — verdict **PASS**
- `@modelcontextprotocol/server-github` — initialize + tools/list:
  baseline=ok canary=ok shape=eq leak=false — verdict **PASS**
- Overall: `PASS — _meta.tank_canary injection is safe for all probed servers.`
- Exit code: `0`

**Fallback (deferred, not implemented in v1):** If a future MCP server in the
broader ecosystem rejects `_meta` or mutates it in a way that breaks canary
tracking, Tank falls back to an out-of-band correlation table keyed by
JSON-RPC request ID (per `plan.md` lines 32-34). Phase 0 did not find any such
server, so v1 ships native injection only.

**Scope note:** Phase 0 spike workspace is disposable and not part of the
repository. The three target servers were chosen to cover the likely
production adapter matrix: filesystem (local I/O), everything (reference
implementation exercising every MCP feature), and github (remote HTTP-backed
with auth). No code from the spike promotes to the Proxy package; Phase 1
reimplements canary logic inside `packages/proxy/` under RED→GREEN.
