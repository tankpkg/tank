# Conversion: Cross-Cutting

## Anchor

**Why this module exists:** Several conversion improvements span multiple pages or touch shared components (command palette, docs layout, CLI analytics). These are smaller in scope but collectively address the "users don't understand what Tank does" gap.

**Consumers:** Docs readers, ⌘K users, CLI users.

**Single source of truth:** Multiple files — see structure below.

---

## Layer 1: Structure

```
apps/registry/src/routes/docs/$.tsx                       # Docs bottom CTA
apps/registry/src/components/command-menu.tsx              # Command palette suggestions
packages/cli/src/                                          # CLI telemetry (NEW)
```

---

## Layer 2: Constraints

| #   | Rule                                                                                     | Rationale                                                             |
| --- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| C1  | Every docs page must render a bottom CTA after the article content                       | Users who finish reading need a next step                             |
| C2  | Docs CTA must include a copyable install command AND a link to `/skills`                 | Two possible next actions: install CLI or browse packages             |
| C3  | Docs CTA must appear after `</article>` but before `DocNavigation` (prev/next links)     | Natural reading flow: content → action → navigate                     |
| C4  | Command palette must include "What is Tank?" suggestion that links to `/docs/overview`   | ⌘K users searching for understanding should find it                   |
| C5  | Command palette "What is Tank?" must appear early in suggestions (not buried)            | Highest-value suggestion for confused users                           |
| C6  | CLI telemetry must be strictly opt-in                                                    | Respects user privacy; no silent tracking                             |
| C7  | CLI telemetry consent prompt fires once on first `tank init` or `tank login`             | Natural touchpoint; never asks twice (persists decision)              |
| C8  | CLI telemetry must be configured via `~/.tank/config.json` under `"telemetry"` key       | Persistent, inspectable, user-controllable                            |
| C9  | CLI telemetry must respect `TANK_TELEMETRY=0`/`=1` env var override                      | Enterprise/debug override                                             |
| C10 | CLI telemetry uses native `fetch` to PostHog HTTP endpoint (no `posthog-node` dep)       | Smaller binary; no upstream SDK risk                                  |
| C11 | CLI telemetry events must be stripped of package names, file paths, and API keys         | Privacy: no sensitive data in events                                  |
| C12 | CLI telemetry must not block or delay any command (2s timeout, abort silent)             | Fire-and-forget; failure must be silent                               |
| C13 | Telemetry prompt skips in CI, non-TTY, on-prem, no-key, env-set, prior-decision contexts | Avoid hanging headless runs; respect environment overrides            |
| C14 | `tank doctor` reports current telemetry state in its diagnostics section                 | Discoverability — users can see what's collected without reading docs |
| C15 | A randomized `telemetryDistinctId` (UUIDv4) identifies the install across events         | Aggregate metrics without fingerprinting users                        |

---

## Layer 3: Examples

### Docs CTA

| #   | Action                 | Expected behavior                                                                                                |
| --- | ---------------------- | ---------------------------------------------------------------------------------------------------------------- |
| E1  | Visit `/docs/overview` | After article, before prev/next nav: "Ready to try? ..." with copyable `tank install` and "Browse packages" link |
| E2  | Visit any docs page    | Same CTA rendered — all docs share the single catch-all route                                                    |

### Command Palette

| #   | Action               | Expected behavior                                                 |
| --- | -------------------- | ----------------------------------------------------------------- |
| E3  | Open ⌘K, type "tank" | Early suggestion: "What is Tank?" linking to `/docs/overview`     |
| E4  | Open ⌘K, type "scan" | Suggestion: "How does scanning work?" linking to `/docs/security` |

### CLI Telemetry

| #   | Action                                           | Expected behavior                                                                  |
| --- | ------------------------------------------------ | ---------------------------------------------------------------------------------- |
| E5  | First interactive `tank init` (TTY, no decision) | Prompt: "Help improve Tank by sending anonymous usage analytics? [y/N]"            |
| E6  | User answers "y"                                 | `telemetry: true` saved; `cli_opted_in` event sent with `source: first-run-prompt` |
| E7  | User answers anything else                       | `telemetry: false` saved; no event                                                 |
| E8  | First `tank login` after install (TTY)           | Same prompt fires once; persists decision                                          |
| E9  | `TANK_TELEMETRY=0 tank install <pkg>`            | No event sent, even if config has `"telemetry": true`                              |
| E10 | `TANK_MODE=selfhosted` anywhere                  | Telemetry hard-disabled; prompt skipped entirely                                   |
| E11 | Piped stdin / CI=true / no TTY                   | Prompt skipped (no hang); manual `tank telemetry on` still works                   |
| E12 | `tank telemetry on/off/status`                   | Manage opt-in directly; emits matching events                                      |
| E13 | `tank doctor`                                    | Prints "Telemetry" section showing current state and override reason if any        |
| E14 | Failed install with "not found"                  | After error, CLI prints "Did you mean:" with fuzzy-matched suggestions             |
