---
title: Credential Vault
description: Protect API keys and secrets from AI agent exfiltration with Tank's format-preserving tokenization proxy — real credentials never reach the model.
---

# Credential Vault

Tank Vault is a **format-preserving tokenization proxy** that sits between your AI agent and the LLM provider. It intercepts outgoing requests, replaces real credentials with structurally identical fakes, and restores them in responses — so the model never sees your actual API keys, database URLs, or tokens.

<svg viewBox="0 0 800 250" xmlns="http://www.w3.org/2000/svg" class="max-w-full" style="font-family: 'Space Grotesk', sans-serif;">
  <defs>
    <marker id="v-arrow" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
      <path d="M0,0 L8,3 L0,6" fill="#64748b"/>
    </marker>
    <marker id="v-arrow-red" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
      <path d="M0,0 L8,3 L0,6" fill="#dc2626"/>
    </marker>
    <marker id="v-arrow-green" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
      <path d="M0,0 L8,3 L0,6" fill="#16a34a"/>
    </marker>
  </defs>
  <!-- Left: WITHOUT VAULT -->
  <text x="200" y="18" text-anchor="middle" fill="#dc2626" font-size="13" font-weight="600">Without Vault</text>
  <!-- Step 1: Agent sends real key -->
  <rect x="10" y="30" width="130" height="40" rx="8" fill="none" stroke="#dc2626" stroke-width="1.5"/>
  <text x="75" y="46" text-anchor="middle" fill="currentColor" font-size="9" font-weight="600">Agent sends</text>
  <text x="75" y="60" text-anchor="middle" fill="#dc2626" font-size="8">sk_live_&lt;REAL…&gt;</text>
  <line x1="140" y1="50" x2="162" y2="50" stroke="#dc2626" stroke-width="1.5" marker-end="url(#v-arrow-red)"/>
  <!-- Step 2: Provider logs contain real key -->
  <rect x="165" y="30" width="130" height="40" rx="8" fill="none" stroke="#dc2626" stroke-width="1.5"/>
  <text x="230" y="46" text-anchor="middle" fill="currentColor" font-size="9" font-weight="600">Provider logs</text>
  <text x="230" y="60" text-anchor="middle" fill="#dc2626" font-size="8">your real key</text>
  <line x1="295" y1="50" x2="317" y2="50" stroke="#dc2626" stroke-width="1.5" marker-end="url(#v-arrow-red)"/>
  <!-- Step 3: Breach -->
  <rect x="320" y="30" width="70" height="40" rx="8" fill="#dc2626" fill-opacity="0.1" stroke="#dc2626" stroke-width="1.5"/>
  <text x="355" y="46" text-anchor="middle" fill="#dc2626" font-size="9" font-weight="600">Breach</text>
  <text x="355" y="59" text-anchor="middle" fill="#dc2626" font-size="8">💀</text>
  <!-- Outcome -->
  <text x="200" y="88" text-anchor="middle" fill="#dc2626" font-size="10" font-weight="600">→ Attacker has your Stripe account</text>
  <!-- Divider -->
  <line x1="400" y1="25" x2="400" y2="210" stroke="#64748b" stroke-width="1" stroke-dasharray="4,3" opacity="0.4"/>
  <!-- Right: WITH VAULT -->
  <text x="600" y="18" text-anchor="middle" fill="#16a34a" font-size="13" font-weight="600">With Vault</text>
  <!-- Step 1: Agent sends fake key -->
  <rect x="420" y="30" width="130" height="40" rx="8" fill="none" stroke="#16a34a" stroke-width="1.5"/>
  <text x="485" y="46" text-anchor="middle" fill="currentColor" font-size="9" font-weight="600">Agent sends</text>
  <text x="485" y="60" text-anchor="middle" fill="#16a34a" font-size="8">sk_live_&lt;FAKE…&gt;</text>
  <line x1="550" y1="50" x2="572" y2="50" stroke="#16a34a" stroke-width="1.5" marker-end="url(#v-arrow-green)"/>
  <!-- Step 2: Provider logs contain fake -->
  <rect x="575" y="30" width="130" height="40" rx="8" fill="none" stroke="#16a34a" stroke-width="1.5"/>
  <text x="640" y="46" text-anchor="middle" fill="currentColor" font-size="9" font-weight="600">Provider logs</text>
  <text x="640" y="60" text-anchor="middle" fill="#16a34a" font-size="8">only the fake</text>
  <line x1="705" y1="50" x2="727" y2="50" stroke="#16a34a" stroke-width="1.5" marker-end="url(#v-arrow-green)"/>
  <!-- Step 3: Breach is harmless -->
  <rect x="730" y="30" width="60" height="40" rx="8" fill="#16a34a" fill-opacity="0.1" stroke="#16a34a" stroke-width="1.5"/>
  <text x="760" y="46" text-anchor="middle" fill="#16a34a" font-size="9" font-weight="600">Breach</text>
  <text x="760" y="59" text-anchor="middle" fill="#16a34a" font-size="8">🤷</text>
  <!-- Outcome -->
  <text x="600" y="88" text-anchor="middle" fill="#16a34a" font-size="10" font-weight="600">→ Your Stripe account is safe</text>
  <!-- How it works row -->
  <rect x="80" y="110" width="640" height="70" rx="10" fill="none" stroke="#10b981" stroke-width="1.5"/>
  <text x="400" y="132" text-anchor="middle" fill="#10b981" font-size="12" font-weight="600">How Vault Swaps</text>
  <text x="210" y="152" text-anchor="middle" fill="currentColor" font-size="10">Real: sk_live_<tspan fill="#dc2626" font-weight="600">&lt;REAL_SECRET&gt;</tspan></text>
  <text x="210" y="168" text-anchor="middle" fill="currentColor" font-size="10">Fake: sk_live_<tspan fill="#16a34a" font-weight="600">&lt;FAKE_SECRET&gt;</tspan></text>
  <text x="580" y="152" text-anchor="middle" fill="#64748b" font-size="10">Same prefix: sk_live_</text>
  <text x="580" y="168" text-anchor="middle" fill="#64748b" font-size="10">Same length: 32 chars</text>
  <!-- Bottom note -->
  <rect x="100" y="198" width="600" height="34" rx="8" fill="none" stroke="#64748b" stroke-width="1" stroke-dasharray="4,3"/>
  <text x="400" y="220" text-anchor="middle" fill="#64748b" font-size="11">The fake has the same prefix + length — the model doesn't notice the difference</text>
</svg>

## Why This Matters

AI agents routinely pass environment variables, config files, and code context to LLM providers. If that context contains API keys, database URLs, or tokens:

- The **model provider** sees your production secrets in training-eligible API logs
- A **prompt injection** in a skill could instruct the model to exfiltrate credentials
- **Stolen tokens** from LLM provider breaches expose your infrastructure

Tank Vault eliminates this entire attack class. Real credentials never leave your machine.

---

## How It Works

### 1. Credential Detection

The scanner uses 10 built-in patterns to detect credentials in outgoing request bodies:

| Pattern ID           | Detects                       | Prefix                                      |
| -------------------- | ----------------------------- | ------------------------------------------- |
| `stripe_secret`      | Stripe Secret Keys            | `sk_live_` / `sk_test_`                     |
| `stripe_publishable` | Stripe Publishable Keys       | `pk_live_` / `pk_test_`                     |
| `aws_access_key`     | AWS Access Key IDs            | `AKIA`                                      |
| `github_pat`         | GitHub Personal Access Tokens | `ghp_`                                      |
| `github_oauth`       | GitHub OAuth Tokens           | `gho_`                                      |
| `openai_key`         | OpenAI API Keys               | `sk-proj-` / `sk-`                          |
| `elevenlabs_key`     | ElevenLabs API Keys           | `elvn_`                                     |
| `jwt_token`          | JWT Tokens                    | `eyJ`                                       |
| `database_url`       | Database Connection Strings   | `postgresql://` / `mysql://` / `mongodb://` |
| `slack_webhook`      | Slack Webhook URLs            | `https://hooks.slack.com/services/`         |

### 2. Format-Preserving Tokenization

When a credential is detected, Vault generates a **structurally identical fake** — same prefix, same length, same character set. The fake passes format validation in the model's context but is cryptographically unrelated to the real credential.

```
Real:  sk_live_<REAL_SECRET>
Fake:  sk_live_<FAKE_SECRET>   ← same prefix, same shape, clearly non-production placeholders
```

**Security properties:**

- Fakes are generated using `crypto.getRandomValues()` (CSPRNG)
- No 5+ character overlap between real and fake suffixes (brute-force resistant)
- Each real credential maps to exactly one fake (bidirectional mapping)
- Mapping is held in-memory only — never written to disk

### 3. Proxy Interception

The proxy only redacts requests that look like AI generation calls — specifically, POST requests with a JSON body containing a `messages` array (the standard chat completion format). All other traffic passes through unmodified.

On the response path, the proxy restores all fake tokens back to their real values, so the agent receives correct credentials in model output.

---

## Architecture

<svg viewBox="0 0 800 380" xmlns="http://www.w3.org/2000/svg" class="max-w-full" style="font-family: 'Space Grotesk', sans-serif;">
  <defs>
    <marker id="v-arrow2" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
      <path d="M0,0 L8,3 L0,6" fill="#64748b"/>
    </marker>
  </defs>
  <!-- Title -->
  <text x="400" y="25" text-anchor="middle" fill="currentColor" font-size="16" font-weight="600">Vault Internal Architecture</text>
  <!-- Detector -->
  <rect x="40" y="60" width="200" height="100" rx="10" fill="none" stroke="#10b981" stroke-width="1.5"/>
  <text x="140" y="88" text-anchor="middle" fill="#10b981" font-size="13" font-weight="600">Detector</text>
  <text x="140" y="108" text-anchor="middle" fill="currentColor" font-size="11">patterns.ts — 10 regexes</text>
  <text x="140" y="126" text-anchor="middle" fill="currentColor" font-size="11">scanner.ts — scan(text)</text>
  <text x="140" y="144" text-anchor="middle" fill="#64748b" font-size="10">sorted, deduped matches</text>
  <!-- Arrow -->
  <line x1="240" y1="110" x2="290" y2="110" stroke="#64748b" stroke-width="1.5" marker-end="url(#v-arrow2)"/>
  <!-- Tokenizer -->
  <rect x="295" y="60" width="210" height="100" rx="10" fill="none" stroke="#10b981" stroke-width="1.5"/>
  <text x="400" y="88" text-anchor="middle" fill="#10b981" font-size="13" font-weight="600">Tokenizer</text>
  <text x="400" y="108" text-anchor="middle" fill="currentColor" font-size="11">generator.ts — CSPRNG fakes</text>
  <text x="400" y="126" text-anchor="middle" fill="currentColor" font-size="11">vault.ts — bidirectional map</text>
  <text x="400" y="144" text-anchor="middle" fill="#64748b" font-size="10">redact() / restore()</text>
  <!-- Arrow -->
  <line x1="505" y1="110" x2="555" y2="110" stroke="#64748b" stroke-width="1.5" marker-end="url(#v-arrow2)"/>
  <!-- Proxy -->
  <rect x="560" y="60" width="200" height="100" rx="10" fill="none" stroke="#10b981" stroke-width="1.5"/>
  <text x="660" y="88" text-anchor="middle" fill="#10b981" font-size="13" font-weight="600">Proxy Server</text>
  <text x="660" y="108" text-anchor="middle" fill="currentColor" font-size="11">server.ts — HTTP proxy</text>
  <text x="660" y="126" text-anchor="middle" fill="currentColor" font-size="11">interceptor.ts — AI filter</text>
  <text x="660" y="144" text-anchor="middle" fill="#64748b" font-size="10">redact out → restore in</text>
  <!-- Runner box -->
  <rect x="180" y="210" width="440" height="100" rx="10" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="400" y="238" text-anchor="middle" fill="currentColor" font-size="13" font-weight="600">Runner</text>
  <text x="400" y="258" text-anchor="middle" fill="currentColor" font-size="11">agents.ts — 6 agent configs (Claude, OpenCode, Cursor, Codex…)</text>
  <text x="400" y="278" text-anchor="middle" fill="currentColor" font-size="11">run.ts — spawn agent with env overrides</text>
  <text x="400" y="296" text-anchor="middle" fill="#64748b" font-size="10">strategies: base-url-overrides | https-proxy | node-options | best-effort</text>
  <!-- Arrow from runner to proxy -->
  <line x1="560" y1="160" x2="560" y2="205" stroke="#64748b" stroke-width="1.5" stroke-dasharray="5,3"/>
  <text x="575" y="185" fill="#64748b" font-size="10">spawns</text>
  <!-- Bootstrap -->
  <rect x="180" y="335" width="440" height="40" rx="8" fill="none" stroke="#64748b" stroke-width="1" stroke-dasharray="4,3"/>
  <text x="400" y="360" text-anchor="middle" fill="#64748b" font-size="11">bootstrap.cjs — patches globalThis.fetch to route through proxy (Node.js --require)</text>
</svg>

The vault package has four layers:

| Layer         | Files                                                           | Responsibility                                                      |
| ------------- | --------------------------------------------------------------- | ------------------------------------------------------------------- |
| **Detector**  | `detector/patterns.ts`, `detector/scanner.ts`                   | Pattern-match credentials in text using 10 regex rules              |
| **Tokenizer** | `tokenizer/generator.ts`, `tokenizer/vault.ts`                  | Generate fakes, maintain bidirectional real↔fake mapping            |
| **Proxy**     | `proxy/server.ts`, `proxy/interceptor.ts`, `proxy/streaming.ts` | HTTP proxy that redacts outgoing AI requests and restores responses |
| **Runner**    | `runner/agents.ts`, `runner/run.ts`, `proxy/bootstrap.cjs`      | Launch agents with env overrides to route traffic through the proxy |

---

## Supported Agents

<div class="my-6 flex justify-center overflow-x-auto">
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 150" class="max-w-full" style="font-family: 'Space Grotesk', sans-serif;">
  <defs>
    <marker id="vp-arrow" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto"><path d="M0,0 L8,3 L0,6" fill="#64748b"/></marker>
  </defs>
  <!-- Agent Detected -->
  <rect x="10" y="50" width="120" height="44" rx="10" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="70" y="69" text-anchor="middle" fill="currentColor" font-size="12" font-weight="600">Agent detected</text>
  <text x="70" y="84" text-anchor="middle" fill="#64748b" font-size="10">runtime check</text>
  <!-- Arrow to decision -->
  <line x1="130" y1="72" x2="170" y2="72" stroke="#64748b" stroke-width="1.5" marker-end="url(#vp-arrow)"/>
  <!-- Decision diamond (simulated with rotated rect) -->
  <rect x="185" y="52" width="76" height="40" rx="4" fill="none" stroke="#10b981" stroke-width="1.5"/>
  <text x="223" y="69" text-anchor="middle" fill="#10b981" font-size="10" font-weight="600">Node.js?</text>
  <text x="223" y="81" text-anchor="middle" fill="#10b981" font-size="10" font-weight="600">Bun?</text>
  <!-- Yes arrow up -->
  <line x1="261" y1="58" x2="330" y2="28" stroke="#16a34a" stroke-width="1.5" marker-end="url(#vp-arrow)"/>
  <text x="290" y="36" text-anchor="middle" fill="#16a34a" font-size="9" font-weight="600">yes</text>
  <!-- base-url-overrides box -->
  <rect x="335" y="10" width="160" height="36" rx="8" fill="none" stroke="#16a34a" stroke-width="1.5"/>
  <text x="415" y="33" text-anchor="middle" fill="#16a34a" font-size="11" font-weight="600">base-url-overrides</text>
  <!-- Decision 2: Electron/Rust? -->
  <line x1="261" y1="72" x2="330" y2="72" stroke="#64748b" stroke-width="1.5" marker-end="url(#vp-arrow)"/>
  <rect x="335" y="52" width="76" height="40" rx="4" fill="none" stroke="#10b981" stroke-width="1.5"/>
  <text x="373" y="69" text-anchor="middle" fill="#10b981" font-size="10" font-weight="600">Electron?</text>
  <text x="373" y="81" text-anchor="middle" fill="#10b981" font-size="10" font-weight="600">Rust?</text>
  <!-- Yes arrow to https-proxy -->
  <line x1="411" y1="72" x2="460" y2="72" stroke="#16a34a" stroke-width="1.5" marker-end="url(#vp-arrow)"/>
  <text x="433" y="65" text-anchor="middle" fill="#16a34a" font-size="9" font-weight="600">yes</text>
  <rect x="465" y="54" width="125" height="36" rx="8" fill="none" stroke="#16a34a" stroke-width="1.5"/>
  <text x="527" y="77" text-anchor="middle" fill="#16a34a" font-size="11" font-weight="600">https-proxy</text>
  <!-- No arrow down to best-effort -->
  <line x1="261" y1="86" x2="330" y2="120" stroke="#eab308" stroke-width="1.5" stroke-dasharray="4,3" marker-end="url(#vp-arrow)"/>
  <text x="290" y="112" text-anchor="middle" fill="#eab308" font-size="9" font-weight="600">unknown</text>
  <rect x="335" y="104" width="200" height="36" rx="8" fill="none" stroke="#eab308" stroke-width="1.5" stroke-dasharray="4,3"/>
  <text x="435" y="127" text-anchor="middle" fill="#eab308" font-size="11" font-weight="600">best-effort (all strategies)</text>
</svg>
</div>

The runner knows how to proxy traffic for these AI agents:

| Agent                    | Runtime  | Proxy Strategy                                                                |
| ------------------------ | -------- | ----------------------------------------------------------------------------- |
| **Claude** (Claude Code) | Node.js  | `base-url-overrides` — rewrites `ANTHROPIC_BASE_URL`, `OPENAI_BASE_URL`, etc. |
| **OpenCode**             | Bun      | `base-url-overrides` — same env var rewriting                                 |
| **Cursor**               | Electron | `https-proxy` — sets `HTTPS_PROXY` / `HTTP_PROXY` env vars                    |
| **Codex**                | Rust     | `https-proxy` — sets `HTTPS_PROXY` / `HTTP_PROXY` env vars                    |
| **OpenClaw**             | Unknown  | `best-effort` — combines all strategies                                       |
| **Universal**            | Unknown  | `best-effort` — combines all strategies                                       |

### Proxy Strategies

| Strategy             | How It Works                                                                                                                                                      |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `base-url-overrides` | Rewrites `ANTHROPIC_BASE_URL`, `OPENAI_BASE_URL`, `MISTRAL_BASE_URL`, `GROQ_BASE_URL` to point at the vault proxy. The agent thinks it's talking to the real API. |
| `https-proxy`        | Sets standard `HTTPS_PROXY` and `HTTP_PROXY` environment variables. Works with any HTTP client that respects proxy settings.                                      |
| `node-options`       | Injects `--require bootstrap.cjs` via `NODE_OPTIONS`, which patches `globalThis.fetch` to route all traffic through the proxy. Also sets `HTTPS_PROXY`.           |
| `best-effort`        | Applies all three strategies simultaneously. Used when the agent's runtime is unknown.                                                                            |

---

## Target URL Routing

The proxy supports two methods for determining where to forward requests:

### Header-based (used by `bootstrap.cjs`)

```http
POST /proxy HTTP/1.1
x-target-url: https://api.anthropic.com/v1/messages
Content-Type: application/json

{ "messages": [...] }
```

### Path-based (used by `base-url-overrides`)

The original API base URL is base64url-encoded into the proxy path:

```
Original:  https://api.anthropic.com
Proxy URL: http://127.0.0.1:{port}/_/aHR0cHM6Ly9hcGkuYW50aHJvcGljLmNvbQ/v1/messages
                                     ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
                                     base64url-encoded original base URL
```

The proxy decodes the base URL and appends the remaining path to reconstruct the full target URL.

---

## Programmatic API

### Scan for credentials

```typescript
import { scan } from "@tankpkg/vault";

const matches = scan("Connect to postgresql://admin:secret@db.internal:5432/app");
// [{ start: 11, end: 57, patternId: 'database_url' }]
```

### Generate format-preserving fakes

```typescript
import { generateFake } from "@tankpkg/vault";

const fake = generateFake("sk_live_<REAL_SECRET>", "stripe_secret");
// 'sk_live_<FAKE_SECRET>' — same prefix, same shape, random placeholder token
```

### Use the vault store for bidirectional mapping

```typescript
import { VaultStore } from "@tankpkg/vault";

const vault = new VaultStore();

// Store a real → fake mapping
vault.store("sk_live_real123", "sk_live_fake456", "stripe_secret");

// Redact all known credentials in a text block
const redacted = vault.redact("My key is sk_live_real123");
// 'My key is sk_live_fake456'

// Restore originals from redacted text
const restored = vault.restore(redacted);
// 'My key is sk_live_real123'
```

### Access credential patterns

```typescript
import { CREDENTIAL_PATTERNS } from "@tankpkg/vault";

for (const pattern of CREDENTIAL_PATTERNS) {
  console.log(pattern.id, pattern.prefix, pattern.label);
}
```

---

## Security Model

### What Vault protects against

| Threat                                  | How Vault prevents it                                                                   |
| --------------------------------------- | --------------------------------------------------------------------------------------- |
| **Credential leakage to LLM providers** | Real keys never appear in API request bodies — only format-preserving fakes             |
| **Prompt injection exfiltration**       | Even if a skill tricks the model into outputting credentials, the output contains fakes |
| **LLM provider data breaches**          | Logs at the provider side contain only fake credentials                                 |
| **Training data contamination**         | Your secrets can't appear in future model training data                                 |

### What Vault does NOT protect against

| Limitation                        | Why                                                                                                            |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| **Credentials in non-AI traffic** | Only POST requests with `messages` arrays are redacted                                                         |
| **Runtime secret access**         | An agent process can still read `process.env` directly — Vault protects the LLM channel, not the local process |
| **Streaming responses**           | `streaming.ts` is currently a passthrough — full streaming support is planned                                  |

### Cryptographic properties

- **CSPRNG**: Fake suffixes generated via `crypto.getRandomValues()` with rejection sampling to avoid modulo bias
- **No overlap guarantee**: Generator retries up to 10 times to ensure no 5+ character substring overlap between real and fake suffixes
- **In-memory only**: The real↔fake mapping lives in `VaultStore` (a pair of `Map` objects) — never serialized to disk, never logged

---

## Package Details

```
@tankpkg/vault v0.1.0
├── src/detector/    — credential pattern matching
├── src/tokenizer/   — fake generation + bidirectional vault store
├── src/proxy/       — HTTP proxy server + AI request interceptor
└── src/runner/      — agent launch configs + environment wiring
```

Zero runtime dependencies. Built with `tsdown`, tested with Vitest.

---

## Further Reading

- [Security Model](/docs/security) — How Tank's 6-stage security pipeline scans skills
- [Permissions](/docs/permissions) — Declare and enforce what skills can access
- [CLI Reference](/docs/cli) — All `tank` commands including `tank vault` (planned)
- [Self-Hosting](/docs/self-hosting) — Run your own registry with full security infrastructure
