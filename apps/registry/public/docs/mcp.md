---
title: MCP Server Integration
description: Use Tank directly from Claude Code, Cursor, VS Code Copilot, Windsurf, and other MCP-compatible AI coding assistants — 17 tools for full skill lifecycle management.
---

# MCP Server Integration

The Tank MCP (Model Context Protocol) server exposes **17 tools** that give your AI assistant full control over the Tank skill lifecycle — authentication, discovery, installation, security scanning, agent linking, and diagnostics — without ever leaving your conversation.

## What is MCP?

MCP is an open protocol by Anthropic that enables AI assistants to connect to external tools and data sources in a standardized way. With the Tank MCP server installed, your AI coding assistant can:

- Authenticate with Tank and manage credentials
- Create and scaffold new skills from scratch
- Publish skills to the registry with optional dry-run validation
- Search the registry and inspect skill metadata
- Install, update, and remove skills with SHA-512 lockfile verification
- Run full 6-stage security scans and view audit results
- Check and enforce permission budgets before installation
- Link skills into agent workspaces for local development
- Diagnose environment health issues

<div class="my-6 flex justify-center overflow-x-auto">
<svg viewBox="0 0 800 220" xmlns="http://www.w3.org/2000/svg" class="max-w-full" style="font-family: 'Space Grotesk', sans-serif;">
  <defs>
    <marker id="mcp-arrow" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto"><path d="M0,0 L8,3 L0,6" fill="#64748b"/></marker>
    <marker id="mcp-arrow-red" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto"><path d="M0,0 L8,3 L0,6" fill="#dc2626"/></marker>
    <marker id="mcp-arrow-green" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto"><path d="M0,0 L8,3 L0,6" fill="#16a34a"/></marker>
  </defs>
  <!-- Divider -->
  <line x1="380" y1="10" x2="380" y2="180" stroke="#64748b" stroke-width="1" stroke-dasharray="4,3" opacity="0.4"/>
  <!-- LEFT: Without MCP -->
  <text x="190" y="18" text-anchor="middle" fill="#dc2626" font-size="12" font-weight="600">Without MCP — 6 context switches</text>
  <!-- Developer -->
  <rect x="10" y="32" width="80" height="140" rx="8" fill="none" stroke="#dc2626" stroke-width="1.5"/>
  <text x="50" y="52" text-anchor="middle" fill="currentColor" font-size="10" font-weight="600">You</text>
  <!-- Agent -->
  <rect x="260" y="32" width="80" height="140" rx="8" fill="none" stroke="#dc2626" stroke-width="1.5"/>
  <text x="300" y="52" text-anchor="middle" fill="currentColor" font-size="10" font-weight="600">Agent</text>
  <!-- Back-and-forth arrows (6 of them) -->
  <line x1="90" y1="68" x2="258" y2="68" stroke="#dc2626" stroke-width="1" marker-end="url(#mcp-arrow-red)"/>
  <text x="174" y="64" text-anchor="middle" fill="#dc2626" font-size="7">1. "tank search X"</text>
  <line x1="258" y1="82" x2="90" y2="82" stroke="#dc2626" stroke-width="1" marker-end="url(#mcp-arrow-red)"/>
  <text x="174" y="79" text-anchor="middle" fill="#dc2626" font-size="7">2. copies result</text>
  <line x1="90" y1="96" x2="258" y2="96" stroke="#dc2626" stroke-width="1" marker-end="url(#mcp-arrow-red)"/>
  <text x="174" y="93" text-anchor="middle" fill="#dc2626" font-size="7">3. pastes to agent</text>
  <line x1="258" y1="110" x2="90" y2="110" stroke="#dc2626" stroke-width="1" marker-end="url(#mcp-arrow-red)"/>
  <text x="174" y="107" text-anchor="middle" fill="#dc2626" font-size="7">4. "install Y"</text>
  <line x1="90" y1="124" x2="258" y2="124" stroke="#dc2626" stroke-width="1" marker-end="url(#mcp-arrow-red)"/>
  <text x="174" y="121" text-anchor="middle" fill="#dc2626" font-size="7">5. "tank install Y"</text>
  <line x1="258" y1="138" x2="90" y2="138" stroke="#dc2626" stroke-width="1" marker-end="url(#mcp-arrow-red)"/>
  <text x="174" y="135" text-anchor="middle" fill="#dc2626" font-size="7">6. confirms done</text>
  <!-- Slow label -->
  <text x="174" y="162" text-anchor="middle" fill="#dc2626" font-size="10" font-weight="600">~3 minutes of copy-paste</text>
  <!-- RIGHT: With MCP -->
  <text x="596" y="18" text-anchor="middle" fill="#16a34a" font-size="12" font-weight="600">With MCP — 1 conversation</text>
  <!-- Agent -->
  <rect x="400" y="40" width="110" height="100" rx="8" fill="none" stroke="#16a34a" stroke-width="1.5"/>
  <text x="455" y="60" text-anchor="middle" fill="currentColor" font-size="11" font-weight="600">Agent</text>
  <text x="455" y="76" text-anchor="middle" fill="#64748b" font-size="8">calls tank_search</text>
  <text x="455" y="88" text-anchor="middle" fill="#64748b" font-size="8">reads result</text>
  <text x="455" y="100" text-anchor="middle" fill="#64748b" font-size="8">calls tank_install</text>
  <text x="455" y="112" text-anchor="middle" fill="#64748b" font-size="8">calls tank_verify</text>
  <text x="455" y="128" text-anchor="middle" fill="#16a34a" font-size="8" font-weight="600">done ✓</text>
  <!-- Direct connection -->
  <line x1="510" y1="90" x2="555" y2="90" stroke="#16a34a" stroke-width="2" marker-end="url(#mcp-arrow-green)"/>
  <text x="533" y="82" text-anchor="middle" fill="#16a34a" font-size="8" font-weight="600">MCP</text>
  <!-- Tank MCP Server -->
  <rect x="558" y="50" width="130" height="80" rx="10" fill="#10b981" stroke="#10b981" stroke-width="1.5"/>
  <text x="623" y="78" text-anchor="middle" fill="white" font-size="12" font-weight="600">Tank MCP</text>
  <text x="623" y="95" text-anchor="middle" fill="white" font-size="10" opacity="0.85">17 tools</text>
  <text x="623" y="112" text-anchor="middle" fill="white" font-size="9" opacity="0.7">direct access</text>
  <!-- Arrow to registry -->
  <line x1="688" y1="90" x2="720" y2="90" stroke="#64748b" stroke-width="1.5" marker-end="url(#mcp-arrow)"/>
  <rect x="722" y="72" width="68" height="36" rx="6" fill="none" stroke="currentColor" stroke-width="1"/>
  <text x="756" y="94" text-anchor="middle" fill="#64748b" font-size="8">Registry</text>
  <!-- Fast label -->
  <text x="596" y="162" text-anchor="middle" fill="#16a34a" font-size="10" font-weight="600">~10 seconds, zero context switches</text>
  <!-- Bottom note -->
  <rect x="160" y="186" width="480" height="28" rx="8" fill="none" stroke="#64748b" stroke-width="1" stroke-dasharray="4,3"/>
  <text x="400" y="205" text-anchor="middle" fill="#64748b" font-size="11">17 tools. Zero copy-paste. The agent manages skills itself.</text>
</svg>
</div>

## Supported AI Tools

| Tool            | MCP Support   | Config Location                                                         |
| --------------- | ------------- | ----------------------------------------------------------------------- |
| Claude Code     | Native        | `.claude/settings.json` (project) or `~/.claude/settings.json` (global) |
| Cursor          | Native        | `~/.cursor/mcp.json`                                                    |
| VS Code Copilot | Native        | `.vscode/mcp.json`                                                      |
| Windsurf        | Native        | MCP settings panel                                                      |
| Zed             | Via extension | MCP configuration                                                       |

## Installation

### Claude Code

Add to `.claude/settings.json` in your project root for project-scoped access, or `~/.claude/settings.json` for global access:

```json
{
  "mcpServers": {
    "tank": {
      "command": "npx",
      "args": ["-y", "@tankpkg/mcp-server"]
    }
  }
}
```

### Cursor

Add to `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "tank": {
      "command": "npx",
      "args": ["-y", "@tankpkg/mcp-server"]
    }
  }
}
```

### VS Code (GitHub Copilot)

Add to `.vscode/mcp.json` in your workspace root:

```json
{
  "servers": {
    "tank": {
      "command": "npx",
      "args": ["-y", "@tankpkg/mcp-server"]
    }
  }
}
```

<Callout type="info">
  The `-y` flag on `npx` ensures `@tankpkg/mcp-server` is automatically installed the first time the MCP server starts.
  No global install required.
</Callout>

## Authentication

The MCP server shares authentication with the Tank CLI. A single credential store at `~/.tank/config.json` is used by both — no need to authenticate separately for each tool.

### Option 1: CLI Sync (Recommended)

Authenticate once from your terminal and all MCP sessions pick it up automatically:

```bash
tank login
```

The browser will open for GitHub OAuth. After approving, your token is stored in `~/.tank/config.json` (permissions `600`) and the MCP server will use it on next invocation.

### Option 2: Environment Variable

Pass a token directly via the MCP config for CI environments or headless setups:

```json
{
  "mcpServers": {
    "tank": {
      "command": "npx",
      "args": ["-y", "@tankpkg/mcp-server"],
      "env": {
        "TANK_TOKEN": "tank_your_token_here"
      }
    }
  }
}
```

`TANK_TOKEN` always takes precedence over `~/.tank/config.json`.

### Option 3: In-Session Login

Ask your AI assistant to authenticate on your behalf using the `login` tool:

```
"Log me into Tank"
```

The AI will initiate a GitHub OAuth device flow, display a verification code, and wait for you to approve access in the browser — all without you typing a single command.

---

## All 17 Tools

<div class="my-6 flex justify-center overflow-x-auto">
<svg viewBox="0 0 750 180" xmlns="http://www.w3.org/2000/svg" class="max-w-full" style="font-family: 'Space Grotesk', sans-serif;">
  <!-- Row 1 -->
  <!-- Auth -->
  <rect x="10" y="10" width="230" height="72" rx="10" fill="none" stroke="#10b981" stroke-width="1.5"/>
  <text x="125" y="30" text-anchor="middle" fill="#10b981" font-size="12" font-weight="600">Auth</text>
  <text x="125" y="50" text-anchor="middle" fill="currentColor" font-size="10">login</text>
  <text x="80" y="66" text-anchor="middle" fill="#64748b" font-size="10">whoami</text>
  <text x="170" y="66" text-anchor="middle" fill="#64748b" font-size="10">logout</text>
  <!-- Publish -->
  <rect x="260" y="10" width="220" height="72" rx="10" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="370" y="30" text-anchor="middle" fill="currentColor" font-size="12" font-weight="600">Publish</text>
  <text x="330" y="54" text-anchor="middle" fill="#64748b" font-size="10">init-skill</text>
  <text x="420" y="54" text-anchor="middle" fill="#64748b" font-size="10">publish-skill</text>
  <!-- Install -->
  <rect x="500" y="10" width="240" height="72" rx="10" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="620" y="30" text-anchor="middle" fill="currentColor" font-size="12" font-weight="600">Install</text>
  <text x="545" y="50" text-anchor="middle" fill="#64748b" font-size="10">install</text>
  <text x="620" y="50" text-anchor="middle" fill="#64748b" font-size="10">update</text>
  <text x="695" y="50" text-anchor="middle" fill="#64748b" font-size="10">remove</text>
  <text x="620" y="66" text-anchor="middle" fill="#64748b" font-size="10">verify</text>
  <!-- Row 2 -->
  <!-- Security -->
  <rect x="10" y="98" width="230" height="72" rx="10" fill="none" stroke="#dc2626" stroke-width="1.5"/>
  <text x="125" y="118" text-anchor="middle" fill="#dc2626" font-size="12" font-weight="600">Security</text>
  <text x="65" y="142" text-anchor="middle" fill="#64748b" font-size="10">audit</text>
  <text x="125" y="142" text-anchor="middle" fill="#64748b" font-size="10">scan</text>
  <text x="190" y="142" text-anchor="middle" fill="#64748b" font-size="10">permissions</text>
  <!-- Discovery -->
  <rect x="260" y="98" width="220" height="72" rx="10" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="370" y="118" text-anchor="middle" fill="currentColor" font-size="12" font-weight="600">Discovery</text>
  <text x="330" y="142" text-anchor="middle" fill="#64748b" font-size="10">search</text>
  <text x="420" y="142" text-anchor="middle" fill="#64748b" font-size="10">info</text>
  <!-- Dev -->
  <rect x="500" y="98" width="240" height="72" rx="10" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="4,3"/>
  <text x="620" y="118" text-anchor="middle" fill="currentColor" font-size="12" font-weight="600">Dev</text>
  <text x="565" y="142" text-anchor="middle" fill="#64748b" font-size="10">link</text>
  <text x="620" y="142" text-anchor="middle" fill="#64748b" font-size="10">unlink</text>
  <text x="680" y="142" text-anchor="middle" fill="#64748b" font-size="10">doctor</text>
</svg>
</div>

### Authentication

---

#### `login`

Authenticate with Tank via GitHub OAuth device flow. Opens a browser authorization page and polls until the user approves. Stores the resulting API token in `~/.tank/config.json`.

| Parameter | Type   | Required | Default | Description                                                |
| --------- | ------ | -------- | ------- | ---------------------------------------------------------- |
| `timeout` | number | No       | 300000  | Authorization timeout in milliseconds (default: 5 minutes) |

**Example prompts:**

- _"Log me into Tank"_
- _"Authenticate with Tank — I need to publish a skill"_

---

#### `logout`

Clear stored Tank credentials from `~/.tank/config.json`. After logout, any operation requiring authentication will fail until `login` is called again.

_No parameters._

**Example prompts:**

- _"Log me out of Tank"_
- _"Clear my Tank credentials"_

---

#### `whoami`

Display the currently authenticated user — username, email, organization memberships, and token scopes.

_No parameters._

**Example prompts:**

- _"Who am I logged in as on Tank?"_
- _"Show my Tank account details"_

---

### Project Setup

---

#### `init-skill`

Scaffold a new skill in the current (or specified) directory. Creates a `tank.json` manifest and a `SKILL.md` documentation template. The `name` must follow the `@org/name` scoped package format.

| Parameter     | Type   | Required | Default | Description                                                  |
| ------------- | ------ | -------- | ------- | ------------------------------------------------------------ |
| `name`        | string | **Yes**  | —       | Skill name in `@org/name` format (e.g., `@acme/code-review`) |
| `version`     | string | No       | `0.1.0` | Initial semver version                                       |
| `description` | string | No       | —       | Short description of the skill                               |
| `directory`   | string | No       | `.`     | Directory to initialize (default: current directory)         |

**Example prompts:**

- _"Create a new Tank skill called @acme/db-migrator"_
- _"Init a Tank skill in ./skills/my-skill with version 1.0.0"_

---

### Publishing & Discovery

---

#### `publish-skill`

Pack and publish a skill to the Tank registry. Runs the 6-stage security pipeline server-side before the skill is made available. Use `dryRun` to validate structure and permissions without uploading.

| Parameter    | Type                      | Required | Default    | Description                               |
| ------------ | ------------------------- | -------- | ---------- | ----------------------------------------- |
| `directory`  | string                    | No       | `.`        | Directory containing the skill to publish |
| `visibility` | `"public"` \| `"private"` | No       | `"public"` | Registry visibility                       |
| `dryRun`     | boolean                   | No       | `false`    | Validate and pack without publishing      |

**Example prompts:**

- _"Publish my skill as a public package"_
- _"Do a dry-run publish of ./my-skill to check for errors before uploading"_

---

#### `search-skills`

Full-text search across the Tank registry using GIN index and trigram similarity. Returns skill name, description, audit score, and latest version.

| Parameter | Type   | Required | Default | Description                      |
| --------- | ------ | -------- | ------- | -------------------------------- |
| `query`   | string | **Yes**  | —       | Search query                     |
| `limit`   | number | No       | `10`    | Maximum results to return (1–50) |

**Example prompts:**

- _"Search Tank for database migration skills"_
- _"Find the top 5 skills related to code review"_

---

#### `skill-info`

Fetch detailed metadata for a specific skill from the registry: description, all published versions, permissions declared, audit score breakdown, download count, and links.

| Parameter | Type   | Required | Default | Description                               |
| --------- | ------ | -------- | ------- | ----------------------------------------- |
| `name`    | string | **Yes**  | —       | Skill name (e.g., `@tankpkg/code-review`) |

**Example prompts:**

- _"Get info about @tankpkg/code-review"_
- _"What permissions does @org/my-skill require?"_

---

### Installation & Management

---

#### `install-skill`

Install a skill into the project's `tank.lock` with full SHA-512 integrity verification. Rejects installation if the skill's declared permissions exceed the project's permission budget defined in `tank.json`.

| Parameter   | Type   | Required | Default  | Description                                |
| ----------- | ------ | -------- | -------- | ------------------------------------------ |
| `name`      | string | **Yes**  | —        | Skill name to install (e.g., `@org/skill`) |
| `version`   | string | No       | `latest` | Specific version or semver range           |
| `directory` | string | No       | `.`      | Project directory containing `tank.json`   |

**Example prompts:**

- _"Install @tankpkg/code-review into this project"_
- _"Install @org/db-migrator version 2.1.0"_

---

#### `update-skill`

Update an installed skill to the latest version within its declared semver range. Respects the range pinned in `tank.json` — will not upgrade across major versions unless the range allows it.

| Parameter   | Type   | Required | Default | Description          |
| ----------- | ------ | -------- | ------- | -------------------- |
| `name`      | string | **Yes**  | —       | Skill name to update |
| `directory` | string | No       | `.`     | Project directory    |

**Example prompts:**

- _"Update @tankpkg/code-review to the latest compatible version"_
- _"Check if @org/db-migrator has updates available and apply them"_

---

#### `remove-skill`

Remove a skill from `tank.json` and `tank.lock`. Does not delete downloaded files from the cache.

| Parameter   | Type   | Required | Default | Description          |
| ----------- | ------ | -------- | ------- | -------------------- |
| `name`      | string | **Yes**  | —       | Skill name to remove |
| `directory` | string | No       | `.`     | Project directory    |

**Example prompts:**

- _"Remove @org/old-skill from this project"_
- _"Uninstall @tankpkg/code-review and update the lockfile"_

---

#### `verify-skills`

Verify that every installed skill in `tank.lock` matches its expected SHA-512 hash. Detects tampering, corruption, or man-in-the-middle substitution. Optionally verify a single named skill.

| Parameter   | Type   | Required | Default | Description                                    |
| ----------- | ------ | -------- | ------- | ---------------------------------------------- |
| `name`      | string | No       | —       | Specific skill to verify (default: all skills) |
| `directory` | string | No       | `.`     | Project directory                              |

**Example prompts:**

- _"Verify the integrity of all installed skills"_
- _"Check that @org/my-skill hasn't been tampered with"_

---

### Security & Verification

---

#### `scan-skill`

Run a local 6-stage security scan on a skill directory. Stages cover: file ingestion and hashing, structural validation, AST static analysis, prompt injection detection, secret scanning, and supply chain checks. Returns a verdict (`PASS`, `PASS_WITH_NOTES`, `FLAGGED`, or `FAIL`) with itemized findings.

| Parameter   | Type   | Required | Default | Description                    |
| ----------- | ------ | -------- | ------- | ------------------------------ |
| `directory` | string | No       | `.`     | Directory of the skill to scan |

**Example prompts:**

- _"Scan my skill for security issues before I publish it"_
- _"Run a full security analysis on ./skills/my-skill"_

<Callout type="info">
  Verdict thresholds: 1+ critical finding → `FAIL`; 4+ high findings → `FAIL`; 1–3 high findings → `FLAGGED`; medium/low
  only → `PASS_WITH_NOTES`.
</Callout>

---

#### `audit-skill`

Retrieve the stored security audit results for a published skill from the registry. Shows the audit score (0–10), individual check results, and the LLM analysis summary (if LLM scanning was active at publish time).

| Parameter | Type   | Required | Default  | Description               |
| --------- | ------ | -------- | -------- | ------------------------- |
| `name`    | string | **Yes**  | —        | Published skill name      |
| `version` | string | No       | `latest` | Specific version to audit |

**Example prompts:**

- _"Show the audit results for @tankpkg/code-review"_
- _"What's the security score for @org/my-skill version 2.0.0?"_

---

#### `skill-permissions`

Display a resolved permission summary for all skills installed in the project, then check that the aggregate permissions do not exceed the budget declared in `tank.json`. Flags any skill that requests permissions outside the allowed budget.

| Parameter   | Type   | Required | Default | Description       |
| ----------- | ------ | -------- | ------- | ----------------- |
| `directory` | string | No       | `.`     | Project directory |

**Example prompts:**

- _"Show me what permissions are required by all installed skills"_
- _"Check if any skill exceeds the permission budget in tank.json"_

---

### Agent Integration

---

#### `link-skill`

Symlink a skill from the Tank cache into a specific agent workspace directory. Useful during local skill development — changes to the source are immediately reflected in the agent workspace without reinstalling.

| Parameter   | Type   | Required | Default | Description                                      |
| ----------- | ------ | -------- | ------- | ------------------------------------------------ |
| `name`      | string | **Yes**  | —       | Skill name to link                               |
| `workspace` | string | **Yes**  | —       | Absolute or relative path to the agent workspace |
| `directory` | string | No       | `.`     | Project directory containing the skill source    |

**Example prompts:**

- _"Link @org/my-skill into the Claude Code workspace at ./agent-workspace"_
- _"Set up a development symlink for my skill so I can test it live"_

---

#### `unlink-skill`

Remove a previously created symlink from an agent workspace. The skill remains installed in the project — only the workspace symlink is removed.

| Parameter   | Type   | Required | Default | Description                 |
| ----------- | ------ | -------- | ------- | --------------------------- |
| `name`      | string | **Yes**  | —       | Skill name to unlink        |
| `workspace` | string | **Yes**  | —       | Path to the agent workspace |
| `directory` | string | No       | `.`     | Project directory           |

**Example prompts:**

- _"Unlink @org/my-skill from the agent workspace"_
- _"Remove the development symlink for @acme/code-review"_

---

### Diagnostics

---

#### `doctor`

Check the health of the Tank environment: Node.js version compatibility, CLI binary availability, registry reachability, `~/.tank/config.json` validity, and lockfile integrity. Returns a pass/fail checklist with remediation hints for any failures.

_No parameters._

**Example prompts:**

- _"Run Tank doctor to check if everything is set up correctly"_
- _"My Tank install seems broken — can you diagnose it?"_

---

## Usage Examples

### Scan Before You Publish

```
User: I just finished my new skill. Can you check if it's safe to publish?

AI: I'll run a full 6-stage security scan first.

    [Uses scan-skill on ./]

    Your skill scored 9.2/10 with no critical or high-severity findings.
    One low-severity note: the SKILL.md is missing an "Examples" section.
    Otherwise it's clean and ready to go. Want me to do a dry-run publish
    to confirm the manifest is valid before uploading?

User: Yes, dry run first.

    [Uses publish-skill with dryRun=true]

    Dry run passed. Your skill @acme/db-migrator v1.0.0 is valid.
    Ready to publish for real?
```

### Discover and Install a Skill

```
User: I need a skill to help with database migrations. Find me something good.

AI: [Uses search-skills with query="database migrations"]

    I found two strong matches:

    | Skill               | Score | Description                              |
    |---------------------|-------|------------------------------------------|
    | @tank/db-migrate    | 9.4   | Safe migrations with automatic rollback  |
    | @community/pg-migrator | 8.7 | PostgreSQL-specific migration toolkit |

    @tank/db-migrate has a higher audit score. Want me to check its
    permissions before installing?

User: Yes.

    [Uses skill-info for @tank/db-migrate]

    It requests: filesystem.read (./migrations/**) and filesystem.write
    (./migrations/**). No network or subprocess access. Safe to install.

    [Uses install-skill for @tank/db-migrate]

    Installed @tank/db-migrate v3.1.2. Lockfile updated with SHA-512 hash.
```

### Check Permission Budget

```
User: Before I deploy, make sure no skill is asking for more permissions
      than we declared in tank.json.

AI: [Uses skill-permissions on ./]

    ✅ All 4 installed skills are within budget.

    Permission summary:
    - @tank/db-migrate     → filesystem.read, filesystem.write (declared)
    - @acme/code-review    → filesystem.read (declared)
    - @org/test-runner     → subprocess (declared)
    - @acme/logger         → no permissions required

    No escalation detected. You're clear to deploy.
```

### Debug a Broken Setup

```
User: Something feels off with my Tank install. Can you check it?

AI: [Uses doctor]

    Tank Environment Health Check:

    ✅ Node.js v24.1.0 — compatible
    ✅ @tankpkg/mcp-server reachable
    ✅ Registry (tankpkg.dev) — reachable
    ✅ ~/.tank/config.json — valid, token present
    ❌ tank.lock — 1 skill has a hash mismatch: @org/my-skill

    Recommendation: Run verify-skills to identify the affected entry,
    then reinstall @org/my-skill to restore a clean lockfile.
```

---

## Understanding LLM Analysis

When LLM-assisted scanning is enabled on the registry, Tank uses AI to review ambiguous static-analysis findings and reduce false positives. The `audit-skill` tool output includes an **LLM Analysis** section when active:

| Field                         | Description                                                            |
| ----------------------------- | ---------------------------------------------------------------------- |
| **Mode**                      | `byollm` (custom provider), `builtin` (Groq/OpenRouter), or `disabled` |
| **Provider**                  | The specific LLM used for analysis                                     |
| **Findings Reviewed**         | Number of ambiguous findings sent to the LLM                           |
| **False Positives Dismissed** | Findings classified as benign by the LLM                               |
| **Threats Confirmed**         | Findings confirmed as genuine security threats                         |
| **Uncertain**                 | Findings the LLM could not confidently classify                        |

### Enabling LLM Analysis (Self-Hosted)

If you run Tank on-premises, configure LLM analysis via environment variables on the Python scanner service:

```bash
# Option 1: Bring your own OpenAI-compatible LLM
LLM_API_KEY=your-api-key
LLM_BASE_URL=https://api.example.com/v1
LLM_MODEL=gpt-4o-mini

# Option 2: Use built-in Groq (free tier available)
GROQ_API_KEY=gsk_xxx

# Option 3: Use OpenRouter
OPENROUTER_API_KEY=sk-or-xxx

# Option 4: Disable LLM entirely (regex + AST scanning only)
LLM_SCAN_ENABLED=false
```

---

## Troubleshooting

### "Not authenticated" errors

The MCP server cannot find a valid token. Run one of:

```bash
# Option 1: Authenticate from the terminal
tank login

# Option 2: Ask your AI assistant
"Log me into Tank"
```

### MCP server not found / fails to start

Ensure the `-y` flag is present in your MCP config so npx auto-installs the package:

```json
{
  "args": ["-y", "@tankpkg/mcp-server"]
}
```

If you're behind a corporate proxy, set `npm_config_registry` or configure your npm proxy settings before starting the MCP client.

### Commands time out

The default `login` timeout is 5 minutes. For slow connections or when SSO adds latency, pass a longer timeout explicitly:

```
"Log me into Tank with a 10-minute timeout"
```

### Token is not recognized

Check token validity directly:

```bash
tank whoami
```

If `whoami` also fails, your token may have been revoked. Run `tank login` to issue a new one.

### `verify-skills` reports a hash mismatch

A hash mismatch means the installed skill file does not match the SHA-512 recorded in `tank.lock`. This could indicate file corruption or tampering. Reinstall the affected skill:

```
"Remove @org/affected-skill and reinstall it"
```

### `install-skill` fails with "permission budget exceeded"

The skill is requesting capabilities beyond what your `tank.json` allows. Review its permissions with `skill-info`, then either:

1. Update your `tank.json` permission budget to allow those capabilities, or
2. Choose an alternative skill with a narrower permission footprint.

---

## Security Notes

- Tokens are stored in `~/.tank/config.json` with Unix file permissions `600` (owner read/write only)
- The MCP server communicates exclusively with `tankpkg.dev` over HTTPS
- Your API token is never logged, cached to disk in plain text beyond `~/.tank/`, or transmitted to third parties
- `TANK_TOKEN` in MCP environment config is kept in your AI tool's process environment — never written to disk by Tank itself
- SHA-512 hashes in `tank.lock` are verified against the registry on every install and on-demand via `verify-skills`
- Permission budget enforcement happens client-side at install time — skills that exceed declared budgets are rejected before any files are extracted

---

## Related

- [CLI Reference](/docs/cli) — Full command documentation for all `tank` CLI commands
- [Publishing Guide](/docs/publishing) — How to prepare and validate skills for publication
- [Security Scanner](/docs/security) — Deep dive into the 6-stage security pipeline
- [API Reference](/docs/api) — REST API endpoints used by the CLI and MCP server
- [Permissions Model](/docs/permissions) — How permission budgets are declared and enforced
