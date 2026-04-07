---
title: Building Multi-Atom Skills
description: Write one tank.json with 7 atom kinds — instructions, hooks, agents, tools, rules, resources, prompts — and tank build compiles them to native configs for 6 AI coding agent platforms.
---

Write one `tank.json` with atoms — instructions, hooks, agents, tools, rules, resources, prompts — and `tank build` compiles them to native configs for any AI coding agent.

## Quick Start

```bash
mkdir my-skill && cd my-skill

# Write tank.json (see format below)
# Write SKILL.md (required for publish)

# Build for your platform
tank build . --platform opencode --out /path/to/project

# Or auto-detect from project files
cd /path/to/project && tank build /path/to/my-skill
```

## tank.json Format

```json
{
  "name": "@yourorg/my-skill",
  "version": "1.0.0",
  "description": "What this skill does",
  "atoms": [
    { "kind": "instruction", "content": "SKILL.md" },
    {
      "kind": "hook",
      "event": "pre-file-write",
      "handler": {
        "type": "dsl",
        "actions": [{ "action": "block", "match": "*.env", "reason": "Never write .env files" }]
      }
    }
  ]
}
```

The `atoms` array is the core. Each atom has a `kind` field that determines its schema. Everything else (`name`, `version`, `skills`, `permissions`) is identical to the legacy `skills.json`.

## The 7 Atom Kinds

### instruction

Injects context into the agent's system prompt.

```json
{
  "kind": "instruction",
  "content": "SKILL.md",
  "scope": "project"
}
```

| Field     | Required | Values                                           |
| --------- | -------- | ------------------------------------------------ |
| `content` | yes      | Relative file path to markdown/text              |
| `scope`   | no       | `"project"` (default), `"global"`, `"directory"` |
| `globs`   | no       | File patterns for directory-scoped rules         |

### hook

Runs code or applies rules on agent events. Two handler types: **DSL** (portable, declarative) and **JS** (full code, platform-specific).

**DSL handler** — works on all platforms:

```json
{
  "kind": "hook",
  "event": "pre-file-write",
  "handler": {
    "type": "dsl",
    "actions": [{ "action": "block", "match": "*.env", "reason": "Protect env files" }]
  }
}
```

**JS handler** — full code:

```json
{
  "kind": "hook",
  "name": "quality-gate",
  "event": "pre-stop",
  "handler": {
    "type": "js",
    "entry": "hooks/quality-gate.ts"
  }
}
```

| Field     | Required | Values                                                               |
| --------- | -------- | -------------------------------------------------------------------- |
| `event`   | yes      | One of 37 canonical events (see below)                               |
| `handler` | yes      | `{ type: "dsl", actions: [...] }` or `{ type: "js", entry: "path" }` |
| `name`    | no       | Identifier for the hook                                              |
| `match`   | no       | Tool/command to match                                                |

### agent

Defines a sub-agent with a role, tools, and model preference.

```json
{
  "kind": "agent",
  "name": "code-reviewer",
  "role": "Senior code reviewer. Focus on correctness, security, readability.",
  "tools": ["file_read", "grep", "glob"],
  "model": "powerful",
  "readonly": true
}
```

| Field      | Required | Values                                                                     |
| ---------- | -------- | -------------------------------------------------------------------------- |
| `name`     | yes      | Agent identifier                                                           |
| `role`     | yes      | System prompt / role description                                           |
| `tools`    | no       | Array of tool names                                                        |
| `model`    | no       | `"fast"`, `"balanced"`, `"powerful"`, `"custom"`, or specific model string |
| `readonly` | no       | If `true`, agent cannot write files                                        |

### tool

Registers an MCP server or external tool.

```json
{
  "kind": "tool",
  "name": "my-analyzer",
  "description": "Custom code analysis tool",
  "mcp": {
    "command": "npx",
    "args": ["-y", "@myorg/analyzer-mcp"],
    "env": { "API_KEY": "${ANALYZER_KEY}" }
  }
}
```

| Field         | Required | Values                                      |
| ------------- | -------- | ------------------------------------------- |
| `name`        | yes      | Tool identifier                             |
| `description` | no       | Human-readable description                  |
| `mcp`         | no       | MCP server config: `command`, `args`, `env` |

### rule

Declarative policy — block, allow, or warn on specific events.

```json
{
  "kind": "rule",
  "event": "pre-command",
  "match": "rm -rf",
  "policy": "block",
  "reason": "Dangerous destructive command"
}
```

| Field    | Required | Values                         |
| -------- | -------- | ------------------------------ |
| `event`  | yes      | Canonical hook event           |
| `policy` | yes      | `"block"`, `"allow"`, `"warn"` |
| `match`  | no       | Pattern to match               |
| `reason` | no       | Explanation shown to user      |

### resource

Declares a file/URI that should be available to the agent.

```json
{
  "kind": "resource",
  "name": "review-criteria",
  "uri": "references/review-criteria.md",
  "description": "Code review scoring rubric",
  "mimeType": "text/markdown"
}
```

### prompt

A reusable prompt template with arguments.

```json
{
  "kind": "prompt",
  "name": "review",
  "description": "Code review prompt",
  "template": "prompts/review.md",
  "arguments": [
    { "name": "files", "description": "Files to review", "required": true },
    { "name": "severity", "description": "Minimum severity" }
  ]
}
```

## Hook Events

37 canonical events grouped by category:

**File lifecycle:** `pre-file-write`, `post-file-write`, `pre-file-read`, `post-file-read`, `pre-file-delete`, `post-file-delete`, `pre-file-rename`, `post-file-rename`, `pre-file-create`, `post-file-create`

**Command execution:** `pre-command`, `post-command`, `pre-bash`, `post-bash`, `pre-terminal`, `post-terminal`

**Tool invocation:** `pre-tool-call`, `post-tool-call`, `pre-mcp-call`, `post-mcp-call`

**Session lifecycle:** `pre-start`, `post-start`, `pre-stop`, `post-stop`, `session-idle`, `session-resume`

**Agent lifecycle:** `pre-agent-spawn`, `post-agent-spawn`, `pre-agent-complete`, `post-agent-complete`

**Context:** `pre-context-load`, `post-context-load`, `pre-context-switch`, `post-context-switch`

**Network:** `pre-network`, `post-network`

**Error:** `on-error`, `on-lint-error`

**Approval:** `pre-approval`, `post-approval`

Not all platforms support all events. Unsupported events compile with a skip warning.

## Supported Platforms

| Platform    | ID            | Instructions | Hooks   | Agents  | Tools  | Rules   | Resources | Prompts |
| ----------- | ------------- | ------------ | ------- | ------- | ------ | ------- | --------- | ------- |
| OpenCode    | `opencode`    | native       | native  | native  | native | native  | native    | native  |
| Claude Code | `claude-code` | native       | native  | inlined | native | native  | native    | native  |
| Cursor      | `cursor`      | native       | native  | native  | native | native  | partial   | partial |
| Windsurf    | `windsurf`    | native       | partial | partial | native | partial | none      | none    |
| Cline       | `cline`       | native       | partial | partial | native | partial | native    | native  |
| Roo Code    | `roo-code`    | native       | partial | native  | native | partial | native    | native  |

**native** = full support. **partial** = supported with caveats. **inlined** = embedded in instructions. **none** = skipped with warning.

## Extensions

Every atom can carry platform-specific overrides:

```json
{
  "kind": "instruction",
  "content": "SKILL.md",
  "extensions": {
    "opencode": { "priority": 100 },
    "cursor": { "alwaysApply": true }
  }
}
```

Each adapter reads its own namespace and ignores others.

## tank build Command

```bash
tank build <skill-dir> [--platform <id>] [--out <dir>] [--dry-run] [--list-platforms]
```

| Flag               | Default     | Description                                                                  |
| ------------------ | ----------- | ---------------------------------------------------------------------------- |
| `--platform <id>`  | auto-detect | Target: `opencode`, `claude-code`, `cursor`, `windsurf`, `cline`, `roo-code` |
| `--out <dir>`      | cwd         | Output directory                                                             |
| `--dry-run`        | false       | Preview without writing                                                      |
| `--list-platforms` | false       | List platforms and exit                                                      |

Auto-detection checks for `.opencode/`, `.cursor/`, `.claude/`, `.windsurf/`, `.clinerules/`, `.roo/` in the target directory.

## Migrating from skills.json

1. Rename `skills.json` to `tank.json`
2. Add `"atoms": [{ "kind": "instruction", "content": "SKILL.md" }]`
3. Everything else stays the same

## Full Example: Quality Gate

```
quality-gate/
├── tank.json
├── SKILL.md
├── hooks/
│   └── quality-gate.ts
└── references/
    └── review-criteria.md
```

**tank.json:**

```json
{
  "name": "@myorg/quality-gate",
  "version": "1.0.0",
  "description": "Code quality review before session ends",
  "atoms": [
    { "kind": "instruction", "content": "SKILL.md" },
    {
      "kind": "hook",
      "name": "quality-gate",
      "event": "pre-stop",
      "handler": { "type": "js", "entry": "hooks/quality-gate.ts" }
    },
    {
      "kind": "agent",
      "name": "code-reviewer",
      "role": "Senior code reviewer. Check every changed file for SOLID/KISS/YAGNI violations.",
      "tools": ["file_read", "grep", "glob", "bash"],
      "model": "powerful"
    }
  ]
}
```

Build:

```bash
tank build ./quality-gate --platform opencode --out /path/to/project
```

## JSON Schema

For IDE autocomplete, reference the JSON Schema in your editor:

```
https://tankpkg.dev/tank-json.schema.json
```

Or for VS Code, add to `.vscode/settings.json`:

```json
{
  "json.schemas": [
    {
      "fileMatch": ["tank.json"],
      "url": "https://tankpkg.dev/tank-json.schema.json"
    }
  ]
}
```
