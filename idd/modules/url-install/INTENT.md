# URL Install

## Anchor

**Why this module exists:** Users find AI skills everywhere — GitHub, ClawHub, skills.sh, blog posts. But installing from untrusted sources is dangerous. No package manager security-scans URL installs (npm skips integrity for git deps, Cargo skips checksums, pip can't hash VCS installs). `tank install <url>` closes this gap: fetch from any supported source, run the 6-stage security scanner, block on critical findings, install only if safe.

**Consumers:** CLI users, CI pipelines, MCP editor integration.

**Single source of truth:**

- `packages/cli/src/commands/install.ts` — `installFromUrl()` pipeline
- `packages/cli/src/lib/url-fetcher.ts` — fetch/clone from URL to temp dir
- `packages/cli/src/lib/scan-gate.ts` — call scan API, enforce verdict
- `apps/registry/src/api/routes/v1/scan.ts` — public scan endpoint (pre-existing)
- `apps/registry/src/lib/scan/url-validator.ts` — SSRF-safe URL allowlist
- `apps/registry/src/lib/scan/url-expander.ts` — resolve URLs to scannable format

---

## Layer 1: Structure

```
apps/
  registry/src/lib/scan/url-validator.ts     # SSRF allowlist — added clawhub.ai
  registry/src/lib/scan/url-expander.ts      # URL type detection + expansion — added clawhub type
  registry/src/api/routes/v1/scan.ts         # Public scan endpoint (pre-existing, unchanged)

packages/
  cli/src/commands/install.ts                # installFromUrl() — 10-step pipeline
  cli/src/bin/tank.ts                        # URL detection routing, --yes flag
  cli/src/lib/url-fetcher.ts                 # NEW: fetch from GitHub/ClawHub/skills.sh
  cli/src/lib/scan-gate.ts                   # NEW: scan API client + verdict enforcement
  internals-schemas/src/schemas/skills-lock.ts  # Extended: source, scan_verdict, scanned_at fields

bdd/
  features/system/url-install/url-install.feature  # BDD scenarios
  steps/system/url-install.steps.ts                # Step definitions (to be written)
```

---

## Layer 2: Constraints

| #   | Rule                                                                           | Rationale                                                            | Verified by  |
| --- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------- | ------------ |
| C1  | URL input is detected by protocol (`https://`) or known host pattern           | Must distinguish `tank install <url>` from `tank install @org/skill` | BDD scenario |
| C2  | Only allowed hosts are accepted (GitHub, ClawHub, skills.sh, agentskills, npm) | SSRF protection — no arbitrary URL fetching                          | BDD scenario |
| C3  | Security scan runs BEFORE any files are placed in `.tank/skills/`              | Never install unscanned content — the whole point of the feature     | BDD scenario |
| C4  | `fail` verdict blocks install unconditionally (exit code 1)                    | Critical findings = hard stop, no override                           | BDD scenario |
| C5  | `flagged` verdict prompts user for confirmation (unless `--yes`)               | Medium/high findings need informed consent                           | BDD scenario |
| C6  | `pass` and `pass_with_notes` proceed without prompt                            | Clean skills should install without friction                         | BDD scenario |
| C7  | `--yes` flag auto-accepts flagged verdicts                                     | CI/automation needs non-interactive mode                             | BDD scenario |
| C8  | SKILL.md must exist in fetched content — otherwise reject                      | Minimum skill structure requirement                                  | BDD scenario |
| C9  | tank.json is generated if missing (name inferred from URL, version `0.0.0`)    | External skills rarely have Tank manifests — don't require them      | BDD scenario |
| C10 | Lockfile entry includes `source`, `scan_verdict`, `scanned_at`                 | Track provenance — know where every installed skill came from        | BDD scenario |
| C11 | Lockfile entry includes `integrity` (SHA-512 of installed files)               | Tamper detection on subsequent installs                              | BDD scenario |
| C12 | Existing registry install flows (`tank install @org/skill`) are unaffected     | URL install is additive — must not break existing behavior           | BDD scenario |
| C13 | Temp directory is cleaned up after install (success or failure)                | No orphaned temp dirs cluttering the filesystem                      | Unit test    |
| C14 | `tank update <name>` re-fetches URL-installed skills and re-scans              | Version tracking for non-registry sources                            | BDD scenario |
| C15 | Scan works without auth (public API, 3/hr anonymous limit)                     | Users shouldn't need an account to scan before installing            | BDD scenario |
| C16 | Scan uses auth token if available (20/hr authenticated limit)                  | Authenticated users get higher rate limit                            | Unit test    |

---

## Layer 3: Examples

| #   | Input                                                  | Expected Output                                                             |
| --- | ------------------------------------------------------ | --------------------------------------------------------------------------- |
| E1  | `tank install https://github.com/user/clean-skill`     | Scan passes → installed to `.tank/skills/clean-skill/` → lockfile written   |
| E2  | `tank install https://github.com/user/malicious-skill` | Scan fails (critical findings) → install blocked, findings displayed        |
| E3  | `tank install https://clawhub.ai/user/flagged-skill`   | Scan flagged → user prompted → accepts → installed                          |
| E4  | `tank install https://clawhub.ai/user/flagged-skill`   | Scan flagged → user prompted → declines → not installed                     |
| E5  | `tank install https://skills.sh/owner/repo/my-skill`   | Skill fetched from skills.sh → scanned → installed                          |
| E6  | `tank install https://github.com/user/no-skillmd`      | Fetched but no SKILL.md → rejected with clear error                         |
| E7  | `tank install https://github.com/user/no-manifest`     | No tank.json → generated automatically → installed                          |
| E8  | `tank install https://evil.example.com/skill.tgz`      | Host not in allowlist → rejected before fetch                               |
| E9  | `tank install https://github.com/user/skill --yes`     | Flagged verdict auto-accepted → installed without prompt                    |
| E10 | `tank install @org/skill` (existing registry install)  | Unchanged behavior — routed to existing `installCommand()`                  |
| E11 | `tank install -g https://github.com/user/clean-skill`  | Installed globally to `~/.tank/skills/clean-skill/`, lockfile in `~/.tank/` |
| E12 | `tank install --global https://clawhub.ai/user/skill`  | Same as E11 — global flag works with all URL sources                        |

---

## Unresolved Questions

1. **Rate limit UX** — when the user hits 3/hr anonymous limit, should we suggest `tank login` or just show the rate limit error?
2. **Offline mode** — should `tank install <url>` work fully offline if the skill was previously installed and is in the lockfile? Currently requires scan API.
3. **Git subpath** — for `github.com/user/repo/tree/main/skills/my-skill`, should we install only the subdirectory or the whole repo?
4. **Version bumps** — when `tank update` re-fetches a URL-installed skill, how do we determine if the content changed? Git SHA comparison? Content hash diff?
5. **ClawHub download format** — ClawHub serves zip files via Convex. If they change their download API, the expander breaks. Should we monitor for this?
