# Vault Module

## Anchor

**Why this module exists:** AI agent skills need API tokens to work, but tokens leak
into AI provider context windows. When an agent reads `$STRIPE_KEY` and sends it in a
prompt to Anthropic/OpenAI, the provider sees your production secret. There is no
standard mechanism to prevent this. Tank Vault is a transparent credential proxy that
sits between the agent harness and the AI provider, scanning ALL outgoing traffic for
anything that looks like a credential token — by pattern, not by configuration. When it
finds one, it generates a format-preserving fake on the fly and stores the mapping. On
the response path, fakes are swapped back to real values so the agent can execute
normally. The AI model never sees real credentials.

**Detection is traffic-based, not config-based.** The user does not register credentials
upfront. The proxy discovers them dynamically as they appear in request bodies. If the
agent sends a message containing `sk_live_...`, the proxy recognizes the pattern, generates
a fake, and swaps it — first encounter or hundredth. Optionally, env var scanning can
pre-seed the vault as a performance bonus, but it is not required.

**Core insight — format-preserving tokenization:** Instead of replacing secrets with
obvious `[REDACTED]` tags (which confuse the model and break tool calls), Vault generates
fake tokens that match the original format — same prefix, same length, same character
set. `sk_live_abc123def456` becomes `sk_live_xKr9mPq2wNv8`. The model treats it as a
real token. On the response path, Vault swaps the fake back to the real value before
the agent executes any commands.

**Prior art:** LLM Guard (MIT, 2.7k stars) implements Anonymize → Vault → Deanonymize
for PII. LiteLLM (41k stars) has a `hide-secrets` guardrail using `detect-secrets`.
Neither generates format-preserving fakes for API keys — that is the novel contribution.
Tank Stage 4 scanner already uses `detect-secrets` patterns for publish-time detection;
Vault reuses those patterns for runtime interception.

**Transparent proxying:** `tank run <agent>` launches the agent with all HTTP(S)
traffic routed through the vault proxy. Different agent runtimes require different
injection strategies — Tank detects the agent type and uses the best method:

| Agent       | Runtime  | Proxy Strategy                                                                 |
| ----------- | -------- | ------------------------------------------------------------------------------ |
| Claude Code | Node.js  | `NODE_OPTIONS="--require tank-proxy-bootstrap.js"` patches global fetch        |
| OpenCode    | Bun      | Provider base URL overrides (Bun has no env-var proxy injection)               |
| Cursor      | Electron | `HTTPS_PROXY` env var (Chromium honors it natively)                            |
| Codex       | Rust     | `HTTPS_PROXY` env var (has built-in proxy reading in `codex-rs/network-proxy`) |
| OpenClaw    | Unknown  | `HTTPS_PROXY` + `NODE_OPTIONS` (best effort)                                   |
| Universal   | Unknown  | `HTTPS_PROXY` + `NODE_OPTIONS` (best effort)                                   |

The proxy inspects ALL traffic it receives, detects AI generation requests by structure
(messages array, chat completions pattern, model field), and scans THOSE for credential-
shaped values. Non-AI requests pass through unmodified.

**Consumers:** `tank run <agent>` CLI command, `packages/vault/` library (importable
for custom integrations), future MCP vault tools.

**Supported agents (all agents Tank supports):** claude, opencode, cursor, codex,
openclaw, universal — as defined in `packages/cli/src/lib/agents.ts`.

**Single source of truth:**

- `packages/vault/src/detector/` — credential pattern detection
- `packages/vault/src/tokenizer/` — format-preserving fake generation + bidirectional vault store
- `packages/vault/src/proxy/` — HTTP proxy with SSE streaming support, AI request detection
- `packages/vault/src/runner/` — agent wrapper (`tank run <agent>`), transparent proxy injection

---

## Layer 1: Structure

```
packages/vault/
  src/
    detector/
      patterns.ts              # Credential format patterns (prefix, regex, charset)
      scanner.ts               # Scan text for credential matches, return spans
    tokenizer/
      generator.ts             # Format-preserving fake token generation
      vault.ts                 # Bidirectional mapping store (fake ↔ real)
    proxy/
      server.ts                # Local HTTP proxy server
      interceptor.ts           # Request body redaction + response body restoration
      streaming.ts             # SSE/streaming chunk-aware processing
      providers.ts             # Provider detection (Anthropic, OpenAI, Google, etc.)
    runner/
      run.ts                   # tank run <agent> — start proxy + launch agent
      agents.ts                # Agent-specific env var configs (base URLs per provider)
    config/
      store.ts                 # Encrypted vault persistence (~/.tank/vault.enc)
    index.ts                   # Public exports
  __tests__/
    detector.test.ts
    generator.test.ts
    vault.test.ts
    interceptor.test.ts
    streaming.test.ts
  package.json
  tsconfig.json

packages/cli/src/commands/
  vault.ts                     # tank vault init, tank vault status
  run.ts                       # tank run <agent>

packages/internals-schemas/src/schemas/
  credentials.ts               # Credential declaration schema for skills.json
```

---

## Layer 2: Constraints

### Detector

| #   | Rule                                                                                                                                                                                       | Rationale                                                           | Verified by  |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------- | ------------ |
| C1  | Detector recognizes credential formats by prefix + structure, not by value                                                                                                                 | Must detect tokens it has never seen before based on shape alone    | BDD scenario |
| C2  | At minimum: Stripe (`sk_live_`, `sk_test_`, `pk_live_`, `pk_test_`), AWS (`AKIA`), GitHub (`ghp_`, `gho_`, `ghs_`), OpenAI (`sk-`), ElevenLabs (`elvn_`), generic high-entropy (40+ chars) | Covers the most common credential formats in the AI skill ecosystem | BDD scenario |
| C3  | Detector returns match spans (start, end, pattern_id) — never logs or stores the matched value                                                                                             | Defense in depth; the detector itself must not leak secrets         | Unit test    |
| C4  | Detection runs in O(n) time on input text length — no backtracking regex                                                                                                                   | Proxy is in the hot path; detection must not add latency            | Unit test    |

### Tokenizer (Format-Preserving Faker)

| #   | Rule                                                                                               | Rationale                                                                 | Verified by  |
| --- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ------------ |
| C5  | Fake token preserves: (a) prefix, (b) length, (c) character set of the original                    | Model treats the fake as a real credential; no confusion or format errors | BDD scenario |
| C6  | Same real token always produces the same fake within a session                                     | Model sees consistent values across multi-turn conversation               | BDD scenario |
| C7  | Different real tokens always produce different fakes                                               | No collisions; bijective mapping within a session                         | Unit test    |
| C8  | Fake tokens are cryptographically random (not derivable from the real token without the vault key) | Prevents reverse-engineering the real credential from the fake            | Unit test    |

### Vault Store

| #   | Rule                                                                                  | Rationale                                                              | Verified by  |
| --- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------ |
| C9  | Vault stores bidirectional mapping: real → fake AND fake → real                       | Needed for both redaction (outgoing) and restoration (incoming)        | BDD scenario |
| C10 | Vault is encrypted at rest using AES-256-GCM with a key derived from machine identity | Credentials must not be readable if `~/.tank/vault.enc` is exfiltrated | Unit test    |
| C11 | Vault is session-scoped by default; persists across restarts only if user opts in     | Minimal persistence reduces blast radius of a compromised vault file   | BDD scenario |
| C12 | Vault never logs real credential values — only fake values and pattern IDs            | Defense in depth; logs are safe to share                               | Unit test    |

### Proxy

| #   | Rule                                                                                                                      | Rationale                                                       | Verified by  |
| --- | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ------------ |
| C13 | Proxy receives ALL HTTP(S) traffic from the agent — completely transparent                                                | Agent never knows it's proxied; all traffic is inspectable      | BDD scenario |
| C14 | Proxy detects AI generation requests by structure (messages array, model field, completions path), not by destination URL | Works for any provider: known, unknown, self-hosted, future     | BDD scenario |
| C15 | Only AI generation request bodies are scanned for credentials; non-AI traffic passes through unmodified                   | npm, git, curl, etc. not slowed or modified                     | BDD scenario |
| C16 | First-seen credentials are tokenized on the fly — fake generated, mapping stored in vault                                 | Zero pre-registration; vault builds up dynamically from traffic | BDD scenario |
| C17 | Proxy handles SSE streaming: buffers partial chunks, scans complete token boundaries                                      | AI APIs stream responses via SSE; must not break streaming      | BDD scenario |
| C18 | On incoming responses, proxy scans for fake tokens and restores real values                                               | Agent can execute commands with real credentials                | BDD scenario |
| C19 | If proxy crashes or is unavailable, agent traffic fails closed (not open)                                                 | Never silently bypass the security layer                        | BDD scenario |
| C20 | Proxy adds < 5ms p99 latency to non-AI requests (passthrough)                                                             | Must not slow down npm, git, or other non-AI traffic            | Perf test    |

### Runner

| #   | Rule                                                                                            | Rationale                                                      | Verified by  |
| --- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ------------ |
| C21 | `tank run <agent>` starts proxy, uses per-agent injection strategy, launches agent              | Single command to get full credential protection               | BDD scenario |
| C22 | Per-agent injection: NODE_OPTIONS for Node.js, HTTPS_PROXY for Electron/Rust, base URLs for Bun | Each runtime gets the most reliable proxy method               | BDD scenario |
| C23 | When agent process exits, proxy shuts down and session vault is cleared                         | No dangling processes, no stale credential mappings            | BDD scenario |
| C24 | Supports all Tank agents: claude, opencode, cursor, codex, openclaw, universal                  | Matches `SUPPORTED_AGENTS` in `packages/cli/src/lib/agents.ts` | BDD scenario |
| C25 | (Bonus) `--prescan` flag pre-seeds vault from env vars for faster first-request perf            | Avoids cold-start on first request; not required               | BDD scenario |

---

## Layer 3: Examples

### Detector

| #   | Input                                               | Expected Output                                         |
| --- | --------------------------------------------------- | ------------------------------------------------------- |
| E1  | `"Use this key: sk_live_4eC39HqLyjWDarjtT1zdp7dc"`  | Match at span [15..51], pattern: `stripe_secret`        |
| E2  | `"My key is AKIAIOSFODNN7EXAMPLE"`                  | Match at span [10..30], pattern: `aws_access_key`       |
| E3  | `"Token: ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"` | Match at span [7..47], pattern: `github_pat`            |
| E4  | `"No credentials here, just regular text"`          | No matches                                              |
| E5  | `"Two keys: sk_live_abc123 and elvn_def456"`        | Two matches: stripe at [11..25], elevenlabs at [30..42] |
| E6  | `"The API base URL is https://api.anthropic.com"`   | No matches (URL is not a credential)                    |

### Tokenizer

| #   | Input                                          | Expected Output                                          |
| --- | ---------------------------------------------- | -------------------------------------------------------- |
| E7  | Real: `sk_live_4eC39HqLyjWDarjtT1zdp7dc`       | Fake: `sk_live_` + 24 random alphanumeric chars          |
| E8  | Real: `AKIAIOSFODNN7EXAMPLE`                   | Fake: `AKIA` + 16 random uppercase alphanumeric chars    |
| E9  | Same real token tokenized twice in one session | Same fake token returned both times                      |
| E10 | Two different Stripe keys tokenized            | Two different fake tokens, both starting with `sk_live_` |

### Proxy (end-to-end redaction → restoration)

| #   | Input (outgoing to provider)                                                                   | Expected Output                                                                            |
| --- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| E11 | Message: `"Call Stripe with sk_live_4eC39HqLyjWDarjtT1zdp7dc"` sent to `api.anthropic.com`     | Provider receives: `"Call Stripe with sk_live_xKr9mPq2wNv8jL3d..."` (fake)                 |
| E12 | Message contains Anthropic API key going to `api.anthropic.com`                                | Key passes through unmodified (provider's own key)                                         |
| E13 | Response from provider: `"Run: curl -H 'Bearer sk_live_xKr9mPq2wNv8jL3d...'"`                  | Agent receives: `"Run: curl -H 'Bearer sk_live_4eC39HqLyjWDarjtT1zdp7dc'"` (real restored) |
| E14 | SSE streaming response with fake token split across chunks: `sk_live_xKr9` + `mPq2wNv8jL3d...` | Token reassembled and restored correctly across chunk boundary                             |
| E15 | Message with no credentials                                                                    | Passes through unmodified, no latency penalty                                              |

### Runner

| #   | Input                        | Expected Output                                                                         |
| --- | ---------------------------- | --------------------------------------------------------------------------------------- |
| E16 | `tank run claude`            | Proxy starts, NODE_OPTIONS + HTTPS_PROXY injected, Claude launched, all traffic proxied |
| E17 | `tank run cursor`            | Proxy starts, HTTPS_PROXY injected (Electron), Cursor launched, all traffic proxied     |
| E18 | `tank run opencode`          | Proxy starts, NODE_OPTIONS + HTTPS_PROXY injected, OpenCode launched                    |
| E19 | Agent exits (Ctrl+C)         | Proxy shuts down, session vault cleared, exit code forwarded                            |
| E20 | `tank run nonexistent-agent` | Error: "Unknown agent. Supported: claude, opencode, cursor, codex, openclaw, universal" |

---

## Open Questions

1. **TLS interception:** HTTPS_PROXY requires the proxy to terminate TLS to inspect request bodies. This means generating a local CA cert. Is a `tank vault init` step acceptable, or must it be fully automatic?
2. **Streaming chunk boundaries:** What happens when a credential token is split across two SSE chunks? Need a buffering strategy that doesn't add unbounded memory usage.
3. **False positive threshold:** Traffic-based detection may flag high-entropy strings that aren't credentials. How aggressive should pattern matching be? Strict prefixes only, or also generic high-entropy?
4. **Vault encryption key derivation:** Using machine identity (hostname + MAC) means vault files aren't portable across machines. Is that acceptable?
5. **AI request detection accuracy:** Detecting AI requests by structure (messages array) may miss non-standard APIs or match non-AI APIs with similar structure. How to handle edge cases?
6. **NODE_OPTIONS conflicts:** If the user already has NODE_OPTIONS set, Tank must append to it, not overwrite. Need careful env var merging.
7. **First-request latency:** When a credential is first seen in traffic, the proxy must generate a fake synchronously before forwarding. Is inline generation fast enough?
