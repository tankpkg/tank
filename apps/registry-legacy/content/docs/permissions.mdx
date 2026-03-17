---
title: Permissions & Access Control
description: Understand Tank's permission model for AI agent skills — declare, enforce, and audit what capabilities your skills can access at install time.
---

# Permissions & Access Control

Tank's permission system is the primary mechanism for preventing malicious skills from accessing resources they were never supposed to touch. This page explains the permission schema, the project-level budget, how enforcement works at install time, and how version bumps interact with permission changes.

## Why Permissions Matter for AI Agent Skills

An AI agent is a process that acts on your behalf. When you give an agent a skill, that skill runs with the agent's full authority — the same API tokens, filesystem access, and subprocess privileges the agent itself holds. There is no OS-level sandbox. There is no automatic restriction.

This means a malicious skill installed without review could:

- **Read your entire project directory** — including `.env` files, SSH keys, and auth tokens
- **Make outbound network calls** to attacker-controlled servers carrying exfiltrated data
- **Execute shell commands** — installing backdoors, modifying codebase files, or pivoting to other systems
- **Read environment variables** — stealing API keys and credentials held by the agent process

The ClawHavoc incident (February 2026, 341 malicious skills, 12% of a major marketplace) exploited exactly this: no registry checked what installed skills actually did. Skills declared nothing and did everything.

Tank's permission model requires skills to declare upfront what they need. Projects then define a **permission budget** — a ceiling that every installed skill must fit within. If any skill claims more than the budget allows, the installation fails before a single file is extracted.

<Callout type="info">
  Tank permissions are a defense-in-depth layer on top of OS-level controls. They cannot enforce syscall-level
  restrictions without a sandbox (planned for Phase 3), but they create an auditable contract between skill publishers
  and project owners — and enforce it at install time.
</Callout>

---

## Permission Types

Permissions are declared in the `permissions` object of a skill's `SKILL.md` manifest. The full schema is defined in `packages/internals-schemas/src/schemas/permissions.ts` as a Zod schema and validated on both the CLI and registry server.

### `network.outbound` — Outbound Network Access

Controls which domains the skill is allowed to make outbound HTTP/HTTPS connections to.

```yaml
# SKILL.md
permissions:
  network:
    outbound:
      - 'api.anthropic.com'
      - '*.openai.com'
      - 'cdn.jsdelivr.net'
```

**Wildcard support:** A leading `*.` prefix matches any subdomain of the specified domain.

| Pattern             | Matches                                    | Does Not Match                       |
| ------------------- | ------------------------------------------ | ------------------------------------ |
| `api.anthropic.com` | `api.anthropic.com`                        | `dev.anthropic.com`, `anthropic.com` |
| `*.anthropic.com`   | `api.anthropic.com`, `dev.anthropic.com`   | `anthropic.com` itself               |
| `*.*.example.com`   | Not supported — single wildcard level only | —                                    |

<Callout type="warn">
  Avoid `["*"]` or broad wildcard patterns. A skill that needs to reach any host on the internet should not be installed
  without careful review. The security scanner flags broad wildcard network permissions as `medium` severity.
</Callout>

---

### `filesystem.read` — Filesystem Read Access

Controls which paths the skill is allowed to read. Values are glob patterns evaluated relative to the **project root** (the directory containing `tank.json`).

```yaml
permissions:
  filesystem:
    read:
      - './src/**'
      - './package.json'
      - './tsconfig.json'
```

**Pattern semantics:**

- `./src/**` — all files recursively under `src/`
- `./src/*.ts` — only TypeScript files directly in `src/`
- `./package.json` — exactly this file
- `../**` — path traversal above project root — **always rejected, critical finding**

Absolute paths (`/etc/hosts`) and home-relative paths (`~/`) are never valid permission values. The Zod schema rejects them on publish.

---

### `filesystem.write` — Filesystem Write Access

Controls which paths the skill is allowed to create, modify, or delete. Same glob pattern semantics as `filesystem.read`.

```yaml
permissions:
  filesystem:
    write:
      - './output/**'
      - './.tank/cache/**'
```

Write permissions are evaluated separately from read permissions. A skill that declares `filesystem.read: ["./src/**"]` does **not** implicitly gain write access to `./src/**`.

<Callout type="error">
  Never grant write access to `./` (project root), `../**` (parent directories), or any path containing configuration
  files (`.env`, `.git/**`, `package.json`). A skill with write access to `package.json` can inject malicious
  dependencies on the next `npm install`.
</Callout>

---

### `subprocess` — Shell Command Execution

A boolean flag that declares whether the skill is allowed to invoke shell commands, spawn child processes, or execute binaries.

```yaml
permissions:
  subprocess: true
```

Deny shell execution (default):

```yaml
permissions:
  subprocess: false
```

`subprocess: false` is the default. Skills that do not declare this field cannot spawn processes.

This is the most dangerous permission in the model. A skill with subprocess access can execute arbitrary code, install software, modify the system, and bypass all other permission checks by spawning a process that has its own network and filesystem access.

<Callout type="error">
  Treat `subprocess: true` as a red flag during skill review. Legitimate skills rarely need subprocess access. If you
  see it, verify exactly what commands the skill runs by inspecting its source code before installing.
</Callout>

---

### `environment` — Environment Variable Access

A list of specific environment variable names the skill is allowed to read. Skills without this permission cannot read any environment variables.

```yaml
permissions:
  environment:
    - 'ANTHROPIC_API_KEY'
    - 'OPENAI_API_KEY'
    - 'DATABASE_URL'
```

This permission is validated against actual `process.env` access found in the skill's code during Stage 2 static analysis. If the code reads `process.env.HOME` but `HOME` is not declared in permissions, the audit score drops and the finding is flagged.

The environment permission does **not** grant the skill the ability to set, export, or delete environment variables — only to read named variables. Write access to the environment is not a supported permission and is always blocked.

---

## The Permission Budget: Project-Level Access Control

Individual skill permissions declare what a skill _claims_ to need. The permission budget in `tank.json` declares what your project _allows_. Every skill installed into your project must fit within the budget — if any skill claims more than the budget permits, installation fails with a detailed error showing which permission was exceeded and by which skill.

### Example `tank.json` with Budget

```json
{
  "skills": {
    "@vercel/next-skill": "^2.1.0",
    "@community/seo-audit": "3.0.0",
    "@team/internal-linter": "workspace:*"
  },
  "permissions": {
    "network": {
      "outbound": ["api.anthropic.com", "*.vercel.com", "registry.npmjs.org"]
    },
    "filesystem": {
      "read": ["./src/**", "./public/**", "./package.json", "./tsconfig.json", "./.env.local"],
      "write": ["./output/**", "./.tank/cache/**"]
    },
    "subprocess": false,
    "environment": ["ANTHROPIC_API_KEY", "VERCEL_TOKEN", "NODE_ENV"]
  }
}
```

This budget tells Tank:

- **Network:** Skills may reach Anthropic's API, any Vercel subdomain, and the npm registry — nothing else
- **Filesystem (read):** Source files, public assets, and config files are readable; secrets in `.env.local` are explicitly granted
- **Filesystem (write):** Only the output directory and Tank's own cache are writable
- **Subprocess:** Blocked — no skill may spawn shell commands
- **Environment:** Only three named variables may be read

If `@community/seo-audit` declares `network.outbound: ["*.googleapis.com"]` — a domain not in the budget — `tank install` will fail:

```
✗ Installation failed: permission budget exceeded

  Skill:       @community/seo-audit@3.0.0
  Permission:  network.outbound
  Requested:   *.googleapis.com
  Budget:      api.anthropic.com, *.vercel.com, registry.npmjs.org

  Either:
    1. Add "*.googleapis.com" to the network.outbound budget in tank.json
    2. Choose a different skill that doesn't require Google API access
    3. Contact the skill author to understand why this domain is needed
```

---

## Budget Enforcement: How `checkPermissionBudget()` Works

The budget enforcement logic runs in the CLI (`apps/cli/src/lib/`) during `tank install` and `tank update`. It compares each skill's declared permissions against the project budget field by field.

### Domain Matching (`network.outbound`)

For each domain the skill requests, the enforcer checks:

1. **Exact match:** `api.anthropic.com` matches `api.anthropic.com` in the budget
2. **Wildcard suffix match:** `api.anthropic.com` matches `*.anthropic.com` in the budget
3. **No match:** Installation fails with the domain listed in the error

The wildcard expansion is single-level only. `api.v2.anthropic.com` does **not** match `*.anthropic.com` — it would need `*.v2.anthropic.com` or `*.*.anthropic.com` (the latter of which is not supported). This prevents accidental over-permissioning through nested wildcard expansion.

### Path Matching (`filesystem.read` and `filesystem.write`)

For each path glob the skill requests, the enforcer checks:

1. **Exact match:** `./package.json` matches `./package.json` in the budget
2. **Glob subsetting:** A skill requesting `./src/utils/**` passes if the budget contains `./src/**` (the requested glob is fully contained within the budget glob)
3. **Glob expansion:** Both sides are expanded against the actual filesystem. If the skill's glob would match files that the budget's glob does not cover, enforcement fails

Glob matching uses the same library used for `.gitignore` pattern matching, with one key difference: patterns are always anchored to the project root and never follow symlinks.

### Subprocess Enforcement

Simple boolean check. If the budget has `subprocess: false` (or omits the field, which defaults to `false`), any skill with `subprocess: true` fails immediately.

### Environment Variable Enforcement

Each variable name the skill requests must appear literally in the budget's `environment` array. There is no wildcard support for environment variable names — `ANTHROPIC_*` is not a valid pattern. Every variable must be named explicitly.

### Enforcement Order

The enforcer checks all skills against the budget before extracting any of them. If multiple skills exceed the budget, all violations are reported together rather than stopping at the first failure:

```
✗ Installation failed: 2 skills exceeded the permission budget

  @foo/skill-a@1.0.0
    network.outbound: "api.openai.com" not in budget

  @bar/skill-b@2.3.1
    subprocess: true, but budget disallows subprocess
    environment: "AWS_SECRET_ACCESS_KEY" not in budget
```

---

## Permission Escalation Detection

Every new version of a skill is checked against its previous version's permissions when published. This prevents a malicious publisher from sneaking dangerous permission changes through as minor or patch releases.

The escalation logic is implemented in `apps/registry-legacy/lib/permission-escalation.ts` and runs server-side during `tank publish`.

### Version Bump Rules

The type of version bump (major, minor, or patch) determines what permission changes are allowed:

| Bump Type                 | Allowed Permission Changes                                                            |
| ------------------------- | ------------------------------------------------------------------------------------- |
| **Major** (1.x.x → 2.0.0) | All changes allowed — users explicitly opt in to major versions                       |
| **Minor** (1.2.x → 1.3.0) | Non-dangerous additions allowed; network domains and subprocess changes require major |
| **Patch** (1.2.3 → 1.2.4) | No new permissions of any kind — only bug fixes                                       |
| **First publish**         | Always allowed — no previous version to compare                                       |

**What constitutes a "dangerous escalation" for minor bumps:**

- Adding a new domain to `network.outbound` → requires major bump
- Enabling `subprocess: true` (was `false` or absent) → requires major bump
- Adding any `environment` variable that includes `SECRET`, `KEY`, `TOKEN`, or `PASSWORD` (case-insensitive) in its name → requires major bump

**What is allowed on minor bumps:**

- Adding new filesystem paths to `read` or `write` (considered lower-risk, surfaced in changelog)
- Adding environment variables with benign names (e.g., `NODE_ENV`, `DEBUG`)

**What is never allowed on patch bumps:**

- Any new permission, including adding a single domain, a single file path, or a single environment variable

### Example Rejection

A skill at version `2.3.4` currently declares:

```yaml
permissions:
  network:
    outbound: ['api.anthropic.com']
  subprocess: false
```

The publisher attempts to publish `2.3.5` (patch bump) with:

```yaml
permissions:
  network:
    outbound: ['api.anthropic.com', 'data.analytics.io'] # new domain
  subprocess: false
```

Result:

```
✗ Publish rejected: permission escalation in patch bump

  Version: 2.3.4 → 2.3.5 (patch)
  Change:  network.outbound — added "data.analytics.io"

  Adding new network domains requires at least a minor version bump.
  New network domains in a minor bump require a major version bump.

  To publish with this permission change, bump to version 3.0.0.
```

<Callout type="info">
  These rules protect skill consumers. When you run `tank update`, you expect patch updates to be safe by definition —
  no new capabilities, no new attack surface. The escalation enforcement makes that guarantee hard rather than advisory.
</Callout>

---

## Permission Best Practices

| Permission         | ✅ Best Practice                         | ❌ Anti-Pattern                          | Why                                                                        |
| ------------------ | ---------------------------------------- | ---------------------------------------- | -------------------------------------------------------------------------- |
| `network.outbound` | `["api.stripe.com", "api.sendgrid.com"]` | `["*"]`                                  | Wildcards allow reaching any host, including attacker-controlled servers   |
| `network.outbound` | `["api.example.com"]`                    | `["*.example.com"]`                      | Only use wildcards if the skill genuinely needs multiple subdomains        |
| `filesystem.read`  | `["./src/**", "./package.json"]`         | `["./**"]` or `["/**"]`                  | Reading the entire project exposes secrets, credentials, and private data  |
| `filesystem.write` | `["./output/**"]`                        | `["./src/**"]`                           | Write access to source files allows backdoor injection                     |
| `filesystem.write` | Never grant                              | `["./.env*"]`                            | Write access to `.env` files allows credential theft                       |
| `subprocess`       | `false` or absent                        | `true` (without justification)           | Subprocess access bypasses all other permission controls                   |
| `environment`      | `["OPENAI_API_KEY"]`                     | (no guidance — always explicit)          | Name only what you need; any undeclared variable the code reads is flagged |
| General            | Declare the minimum needed               | Declare broad permissions "just in case" | Broad permissions harm your audit score and erode user trust               |

### The Minimal-Permission Principle

Declare only the permissions your skill actually requires to function. This principle matters for two reasons:

1. **Audit score:** Check #5 (permission extraction match) awards 2 points when your declared permissions precisely match what the code actually uses. Over-declaring permissions costs points even if no code uses them.

2. **Installer trust:** The registry displays permissions prominently on every skill page. A skill with `subprocess: true` and broad filesystem write access will receive fewer installs than an equivalent skill with minimal permissions — because sophisticated users read the permission list before installing.

---

## Viewing Permissions

### CLI: `tank permissions`

The `tank permissions` command reads the installed lockfile and displays a resolved summary of every permission in use across all installed skills, grouped by type:

```bash
tank permissions

# Output:
# Resolved permissions for 3 installed skills
#
# network.outbound
#   api.anthropic.com          ← @vercel/next-skill@2.1.3
#   *.vercel.com               ← @vercel/next-skill@2.1.3
#   cdn.jsdelivr.net           ← @community/seo-audit@3.0.0
#
# filesystem.read
#   ./src/**                   ← @vercel/next-skill@2.1.3, @community/seo-audit@3.0.0
#   ./package.json             ← all 3 skills
#   ./.env.local               ← @team/internal-linter@1.0.0
#
# filesystem.write
#   ./output/**                ← @community/seo-audit@3.0.0
#   ./.tank/cache/**           ← @vercel/next-skill@2.1.3
#
# subprocess
#   (none)
#
# environment
#   ANTHROPIC_API_KEY          ← @vercel/next-skill@2.1.3
#   VERCEL_TOKEN               ← @vercel/next-skill@2.1.3
#   NODE_ENV                   ← @community/seo-audit@3.0.0
```

This view makes it immediately clear which skill is claiming which access. If `.env.local` appearing under `filesystem.read` is unexpected for your use case, you can investigate `@team/internal-linter` before trusting it with that access.

### MCP Tool: `tank_permissions`

The MCP server exposes a `tank_permissions` tool that returns the same resolved permission summary as a structured JSON object, making it usable by the agent itself to introspect what its skills are allowed to do:

```json
{
  "network": {
    "outbound": {
      "api.anthropic.com": ["@vercel/next-skill@2.1.3"],
      "*.vercel.com": ["@vercel/next-skill@2.1.3"]
    }
  },
  "filesystem": {
    "read": {
      "./src/**": ["@vercel/next-skill@2.1.3", "@community/seo-audit@3.0.0"],
      "./package.json": ["@vercel/next-skill@2.1.3", "@community/seo-audit@3.0.0", "@team/internal-linter@1.0.0"]
    },
    "write": {
      "./output/**": ["@community/seo-audit@3.0.0"]
    }
  },
  "subprocess": false,
  "environment": {
    "ANTHROPIC_API_KEY": ["@vercel/next-skill@2.1.3"],
    "VERCEL_TOKEN": ["@vercel/next-skill@2.1.3"],
    "NODE_ENV": ["@community/seo-audit@3.0.0"]
  }
}
```

---

## Further Reading

- [Security Model](/docs/security) — How the 6-stage scanner detects malicious permissions usage in code
- [Security Checklist](/docs/security-checklist) — Pre-publish checklist including permission best practices
- [Publishing Guide](/docs/publishing) — Full workflow for declaring permissions when publishing
- [CLI Reference](/docs/cli) — All `tank permissions`, `tank audit`, and `tank verify` command options
