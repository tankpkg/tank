# Building Multi-Atom Skills

Write one `tank.json` with atoms — instructions, hooks, agents, tools, rules, resources, prompts — and `tank build` compiles them to native configs for any AI coding agent.

## Quick Start

```bash
# Create a skill directory
mkdir my-skill && cd my-skill

# Write tank.json (see below)
# Write SKILL.md (required for publish)

# Build for your platform
tank build . --platform opencode --out /path/to/project

# Or let it auto-detect from project files
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

The `atoms` array is the core of the format. Each atom has a `kind` that determines its schema. Everything else (`name`, `version`, `skills`, `permissions`, etc.) is identical to the legacy `skills.json`.

## The 7 Atom Kinds

### instruction

Injects context into the agent's system prompt. Content is a file path relative to the skill directory.

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

**Platform output:** OpenCode → `.opencode/instructions/*.md`, Claude Code → `.claude/instructions/*.md`, Cursor → `.cursor/rules/*.mdc`, Windsurf → `.windsurfrules` append, Cline → `.clinerules` append, Roo Code → `.roo/rules/*.md`

### hook

Runs code or applies rules when agent events fire. Two handler types: DSL (portable, declarative) and JS (full code, platform-specific).

**DSL handler** — portable across all platforms:

```json
{
  "kind": "hook",
  "event": "pre-file-write",
  "handler": {
    "type": "dsl",
    "actions": [
      { "action": "block", "match": "*.env", "reason": "Protect env files" },
      { "action": "block", "match": "*.key", "reason": "Protect key files" }
    ]
  }
}
```

**JS handler** — full code, platform-specific:

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
| `event`   | yes      | One of 37 canonical events (see Events Reference below)              |
| `handler` | yes      | `{ type: "dsl", actions: [...] }` or `{ type: "js", entry: "path" }` |
| `name`    | no       | Identifier for the hook                                              |
| `match`   | no       | Tool/command to match (e.g. `"file_write"`, `"bash"`)                |

**Platform output:** OpenCode → `.opencode/plugins/<name>/` with manifest, Claude Code → `.claude/settings.json` hooks array, Cursor → `.cursor/hooks.json`, others → equivalent hook configs or skip+warn.

### agent

Defines a sub-agent with a role, available tools, and model preference.

```json
{
  "kind": "agent",
  "name": "code-reviewer",
  "role": "You are a senior code reviewer. Focus on correctness, security, and readability.",
  "tools": ["file_read", "grep", "glob"],
  "model": "powerful",
  "readonly": true
}
```

| Field      | Required | Values                                                                       |
| ---------- | -------- | ---------------------------------------------------------------------------- |
| `name`     | yes      | Agent identifier                                                             |
| `role`     | yes      | System prompt / role description                                             |
| `tools`    | no       | Array of canonical tool names or custom strings                              |
| `model`    | no       | `"fast"`, `"balanced"`, `"powerful"`, `"custom"`, or a specific model string |
| `readonly` | no       | If `true`, agent cannot write files                                          |

Abstract model tiers (`fast`, `balanced`, `powerful`) are mapped per-platform. They are never emitted as literal model names to prevent `ProviderModelNotFoundError`.

**Platform output:** OpenCode → `.opencode/agents/<name>.md`, Claude Code → `{file:...}` inlined into instructions, Cursor → `.cursor/agents/<name>.json`, Windsurf → agent block in config, Cline → custom instructions, Roo Code → `.roomodes` entry.

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

**Platform output:** OpenCode → `opencode.json` mcpServers entry, Claude Code → `.claude/settings.json` mcpServers, Cursor → `.cursor/mcp.json`, Windsurf → `~/.codeium/windsurf/mcp_config.json`, Cline → `.cline/mcp_settings.json`, Roo Code → `.roo/mcp.json`.

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

Rules compile to hooks internally. They're syntactic sugar for common guard patterns.

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

| Field         | Required | Values                     |
| ------------- | -------- | -------------------------- |
| `uri`         | yes      | File path or URL           |
| `name`        | no       | Resource identifier        |
| `description` | no       | Human-readable description |
| `mimeType`    | no       | MIME type hint             |

**Platform output:** platforms with MCP resource support get server configs; others inline the content via `{file:...}` references.

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
    { "name": "severity", "description": "Minimum severity", "required": false }
  ]
}
```

| Field         | Required | Values                                     |
| ------------- | -------- | ------------------------------------------ |
| `name`        | yes      | Prompt identifier                          |
| `template`    | yes      | Relative file path to template             |
| `description` | no       | Human-readable description                 |
| `arguments`   | no       | Array of `{ name, description, required }` |

## Events Reference

37 canonical events, grouped by category:

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

## Extensions

Every atom can carry an `extensions` bag for platform-specific overrides:

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

Extensions are opaque key-value objects. Each adapter reads its own namespace and ignores others.

## Supported Platforms

| Platform    | ID            | Instructions | Hooks   | Agents  | Tools  | Rules   | Resources | Prompts |
| ----------- | ------------- | ------------ | ------- | ------- | ------ | ------- | --------- | ------- |
| OpenCode    | `opencode`    | native       | native  | native  | native | native  | native    | native  |
| Claude Code | `claude-code` | native       | native  | inlined | native | native  | native    | native  |
| Cursor      | `cursor`      | native       | native  | native  | native | native  | partial   | partial |
| Windsurf    | `windsurf`    | native       | partial | partial | native | partial | none      | none    |
| Cline       | `cline`       | native       | partial | partial | native | partial | native    | native  |
| Roo Code    | `roo-code`    | native       | partial | native  | native | partial | native    | native  |

**native** = full support. **partial** = supported with caveats (check warnings). **inlined** = content embedded in instructions. **none** = skipped with warning.

## Migrating from SKILL.md-Only

If your skill is just a SKILL.md file with a `skills.json` manifest, you can migrate incrementally:

1. Rename `skills.json` to `tank.json`
2. Add `"atoms": [{ "kind": "instruction", "content": "SKILL.md" }]`
3. Keep everything else unchanged — `name`, `version`, `skills`, `permissions` all work the same

Your skill now compiles to platform-native instruction files via `tank build` instead of just symlinking SKILL.md.

## Full Example: Quality Gate

A multi-atom skill that reviews code quality before the agent stops:

```
my-quality-gate/
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
    {
      "kind": "instruction",
      "content": "SKILL.md"
    },
    {
      "kind": "hook",
      "name": "quality-gate",
      "event": "pre-stop",
      "handler": {
        "type": "js",
        "entry": "hooks/quality-gate.ts"
      }
    },
    {
      "kind": "agent",
      "name": "code-reviewer",
      "role": "Senior code reviewer. Check every changed file for correctness, security, readability. Use SOLID/KISS/YAGNI criteria.",
      "tools": ["file_read", "grep", "glob", "bash"],
      "model": "powerful"
    }
  ]
}
```

Build and deploy:

```bash
tank build ./my-quality-gate --platform opencode --out /path/to/project
```

This generates:

- `.opencode/instructions/quality-gate-instruction.md`
- `.opencode/plugins/quality-gate/` (manifest + handler)
- `.opencode/agents/code-reviewer.md`
