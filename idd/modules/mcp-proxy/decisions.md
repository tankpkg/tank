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

---

## D13: ClawGuard integration via git submodule + build-time codegen

**Question:** How should Tank consume the ClawGuard regex pattern set?

**Decision:** Add `joergmichno/clawguard` as a **git submodule** at
`packages/internals-helpers/vendor/clawguard/` pinned to ref `4ec3e09` (MIT).
A `scripts/codegen-clawguard.ts` parses the Python tuples at build time and
emits TypeScript at `packages/internals-helpers/src/prompt-injection/patterns.ts`.

**Rationale:**

- Upstream is Python; native import is impossible. Build-time codegen produces
  a pure-TS artifact consumable by `@internals/helpers` with no Python runtime.
- Submodule + pinned ref keeps provenance auditable: anyone can verify the
  generated `patterns.ts` matches the upstream tuples at the pinned commit.
- MIT license compatibility — attribution recorded in `vendor/clawguard/LICENSE`
  (included via submodule) and in Tank's third-party notices.
- Actual exported pattern count is **55 across 7 categories** (Prompt Injection
  17, Code Obfuscation 11, Data Exfiltration 9, Dangerous Command 5, Shell
  Injection 5, Social Engineering 5, Tool Manipulation 3). The historical "216"
  figure in upstream docs counts internal pattern variants, not the
  TS-importable exported list.

**Alternatives rejected:**

- Vendor Python tuples as TypeScript by hand: violates DRY + drift risk when
  upstream updates.
- Port ClawGuard to TypeScript upstream: out of scope and creates downstream
  fork maintenance burden.
- npm package: ClawGuard has no npm artifact; no maintainer commitment to ship one.

---

## D14: Pin file format + concurrency model

**Question:** Where and how are rug-pull schema pins persisted? How are
concurrent writes handled when multiple `tank proxy` processes observe the
same package?

**Decision:** **One file per package-hash** at
`~/.tank/proxy/pins/<package-hash>.json` (directory mode `0700`). Writes use
**atomic rename with a per-writer unique temp file**: serialize → write to
`<hash>.json.tmp.<pid>.<random8>` (where `<random8>` = 4 bytes from
`crypto.randomBytes` rendered as hex) → `fs.rename()` onto `<hash>.json`. On
proxy startup, a sweep in `pin-io.ts#sweepStaleTemps()` deletes any
`<hash>.json.tmp.*` file older than 1 hour. No advisory lockfile. Reads that
fail (corrupt JSON, `EACCES`, `EIO` — but **not** `ENOENT`, which is
first-run) **fail closed**: the `tools/list` call is rejected with JSON-RPC
error `-32002` rather than silently re-pinning.

**Rationale:**

- One-file-per-package isolates failures (one corrupt pin ≠ all pins lost) and
  makes `--reset-pins` trivial (delete files in the directory).
- POSIX `rename()` on the same filesystem is atomic — no partial-write window.
- **Per-writer unique temp filename eliminates the concurrent-writer race.**
  A shared `<hash>.json.tmp` would let two processes stomp each other's
  partially-written bytes before either rename completes. Per-PID + random
  suffix guarantees each writer owns its own temp file.
- The startup sweep reclaims temp files from crashed writers without requiring
  lock-recovery logic or a dedicated cleanup daemon.
- Fail-closed on read failure prevents the attack where an adversary corrupts
  a pin file to trigger silent re-pinning and bypass rug-pull detection.
  `ENOENT` stays benign so first-run flow still works.
- No lockfile dependency — avoids `proper-lockfile` and its stale-lock cleanup
  complexity for a case that doesn't need it.

**Alternatives rejected:**

- Shared `<hash>.json.tmp`: racy — two concurrent writers stomp each other.
  (Oracle flagged this in the original D14 draft; corrected here.)
- `O_EXCL` on a shared temp path + retry: achieves uniqueness but adds retry
  logic for marginal benefit over PID+random.
- Single `pins.json` with all packages: concurrent writes would require file
  locking, and one corrupt entry would invalidate the whole store.
- SQLite: runtime dependency for a problem solvable with `fs.rename()`.
- Advisory lockfile: overkill since concurrent writers converge to the same
  content.
- "Accept the race as benign": rejected — writers produce `pinnedAt`
  timestamps that differ between calls, so written bytes are not bit-identical
  across concurrent runs.

---

## D15: Combined normalization pipeline (Tank + ClawGuard)

**Question:** ClawGuard ships its own normalization (`_normalize_leet` +
whitespace collapse). Tank's plan specified zero-width strip + homoglyph decode

- base64 decode. Which normalizer runs?

**Decision:** **Both run, in a fixed order**, on every scan. Pipeline:

1. Strip zero-width codepoints (U+200B/C/D, U+FEFF, U+2060) — Tank.
2. NFKC Unicode normalization + homoglyph decode — Tank.
3. Detect + decode base64-embedded substrings — Tank.
4. ClawGuard leet-speak reversal (`_normalize_leet` port) — ClawGuard.
5. Whitespace collapse — ClawGuard.

Implemented in `packages/internals-helpers/src/prompt-injection/normalizer.ts`
as a single `normalizeForScan(text): string` function.

**Rationale:**

- The two pipelines cover **disjoint evasion classes**: ClawGuard handles
  character-level obfuscation within the ASCII/Latin range (leet, excess
  whitespace); Tank's pipeline handles Unicode/encoding-layer obfuscation
  (zero-width insertion, homoglyph substitution, base64 smuggling).
- Running both in sequence catches attackers who combine techniques (e.g.
  base64-encoded leet-speak: first decode base64, then reverse leet).
- Order matters: Unicode stripping must precede leet reversal so that
  `Ignore​pr3v` (with zero-width + leet) resolves to `Ignoreprev` before
  pattern matching.
- Single function, single test surface — no "which pipeline did this come
  from" ambiguity during debugging.

**Alternatives rejected:**

- Tank-only pipeline: misses leet attacks (`1gn0r3 pr3v10us 1nstruct10ns`).
- ClawGuard-only pipeline: misses zero-width and homoglyph attacks.
- Configurable pipeline: YAGNI — the sum of both is always correct.

---

## D16: Policy schema stub + loader shipped in Phase 2

**Question:** C40 declares per-tool policy overrides merging
`~/.tank/proxy/policy.json` with project `tank.json`. Phase 3+ consumes this.
Should the schema + loader ship in Phase 2 or wait?

**Decision:** **Ship the schema stub + loader in Phase 2.** Schema lives in
`packages/internals-schemas/src/schemas/proxy-policy.ts`; loader lives in
`packages/proxy/src/policy/loader.ts`. Phase 2 consumes only the `blockOnMatch`
field; Phases 3/4/7 wire additional fields as they need them.

**Rationale:**

- Phase 2 already introduces the first per-tool override (`blockOnMatch:
false` for allowlisted noisy tools). Without the loader, Phase 2 either
  hardcodes the flag or builds a throwaway loader that Phase 3 rewrites.
- The deep-merge behavior (project wins, per D8) is non-trivial and deserves
  unit tests right away, not retroactively.
- Keeps `@internals/schemas` as the single source of truth for proxy policy —
  no drift between "what Phase 2 uses" and "what Phases 3–9 will use".
- The stub is small (~40 lines of Zod + ~30 lines of loader). Shipping it now
  avoids a Phase 3 premise collision.

**Phase-2 schema fields (locked):**

- Global: `perfBudgetMs: number`, `blockOnMatch: boolean`,
  `resetPinsOnMismatch: boolean`.
- Per-tool override: `scan?: boolean`, `blockOnMatch?: boolean` — more fields
  added in later phases (`redactArgs?` Phase 4, `enableMl?` Phase 7).

---

## D17: Generated `patterns.ts` committed to git; submodule optional at runtime

**Question:** Should the generated `patterns.ts` file be checked into git, or
generated on every build from the submodule?

**Decision:** **Commit generated `patterns.ts` to git.** The submodule is
optional at runtime (dev clones may skip `--recurse-submodules`); CI
regenerates `patterns.ts` during release prep and fails the build if the
committed artifact drifts from the codegen output.

**Rationale:**

- `bun install` should not require `git submodule update --init` to succeed.
  Keeping the submodule optional at runtime removes that coupling.
- CI drift check (regenerate → `git diff --exit-code patterns.ts`) catches the
  case where someone updates the submodule ref without regenerating.
- The generated file is auditable in code review: reviewers see the 55
  patterns directly instead of having to run codegen locally.
- ~8 KB of generated TypeScript is cheap to keep in git; regenerating on every
  `bun install` would slow down cold clones and require Python runtime.

**Alternatives rejected:**

- Generate on every build: adds Python dependency to the build pipeline and
  couples `bun install` to submodule init.
- Publish as a separate npm package: over-engineering for a single consumer.

---

## D18: Phase 2 ships as a single PR (no 2a/2b split)

**Question:** Should Phase 2 split into 2a (detection: tool-poisoning +
rug-pull + normalizer + codegen) and 2b (policy schema stub + loader +
`--reset-pins` CLI)?

**Decision:** **Single PR against `main`.** All Phase 2 scope in one
reviewable unit. Revised effort estimate: 5–7 days.

**Rationale:**

- Atomic story: "Phase 2 adds threat detection + the policy surface that
  controls it" is one coherent narrative for reviewers.
- The policy loader is small (~70 LOC including tests) and shares test
  fixtures with the scanner — splitting forces duplication.
- Matches Phase 1's one-PR pattern; reviewers already know the rhythm.
- Estimated diff ~800–1200 LOC — below the point where a split is forced.
- If implementation reveals the diff ballooning past ~1500 LOC, the split is
  still available as an implementation-time fallback; plan does not lock it
  in.

**Alternatives rejected:**

- Split 2a/2b: two Oracle passes, two review cycles, and the policy loader
  needs a stub contract until 2b lands — adds friction without a clear win.
- Defer policy loader to Phase 3: see D16 — blocks Phase 2 override work.

---

## D19: Phase 2 pin identity = argv hash; Phase 6 upgrades to package-manifest hash

**Question:** `~/.tank/proxy/pins/<package-hash>.json` uses a
`<package-hash>` key. Phase 6 adapter rewriting knows package name + version
(the obvious input), but Phase 2 ships first — and a standalone
`tank proxy -- npx @org/mcp-server` has no package manifest to derive
identity from. What does Phase 2 use as the pin key?

**Decision:** **Phase 2 uses `sha256hex(JSON.stringify([resolvedExe, ...resolvedArgs]))`**
after per-element whitespace-trim. For `tank proxy -- npx @org/mcp-server`,
that hashes `['npx', '@org/mcp-server']`. For `tank proxy --remote <url>`,
that hashes `['--remote', <url>]`. Phase 6 adapter rewriting later upgrades
to a package-manifest-derived hash and migrates existing pins by renaming
files under `~/.tank/proxy/pins/`.

**Rationale:**

- Phase 2 has to ship first; adapter rewriting is Phase 6. Phase 2 needs a
  stable identity that works today without dragging adapter infrastructure
  forward.
- argv-based identity is deterministic per invocation: same command line →
  same pin key across restarts.
- Distinct invocations (different args, different flags) get distinct pin
  keys, which is correct — they are semantically different processes.
- Migration in Phase 6 is a one-time directory rename, not a schema change.
  The file format stays identical; only the filename (pin key) changes.
- Two invocations that differ only in whitespace should pin together, so
  per-element trim is applied before hashing. Two invocations that differ in
  argument order should NOT pin together, which `JSON.stringify` of an array
  preserves naturally.

**Alternatives rejected:**

- `initialize`-response hash (server's own `serverInfo.name + version`): the
  server can lie about its identity, and some servers don't populate
  `serverInfo` fully. Untrustworthy for a security key.
- `tank.lock` lookup with fallback to argv: two code paths add complexity for
  limited Phase 2 benefit. Phase 6 will introduce the lock-aware path
  centrally; Phase 2 doesn't need it yet.
- Deferring the decision to implementation time: Oracle flagged the gap as
  must-fix-before-implementation; leaving the pin key undefined leaves a
  security-relevant design choice dangling.
