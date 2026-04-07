---
title: Building Multi-Atom Skills
description: Write one tank.json with 7 atom kinds — instructions, hooks, agents, tools, rules, resources, prompts — and tank build compiles them to native configs for 6 AI coding agent platforms.
---

> **Tank skills are portable.** Write a `tank.json` once, run `tank build`, and Tank compiles it into native config files for OpenCode, Claude Code, Cursor, Windsurf, Cline, or Roo Code. No manual platform wiring.

Today, teaching something to your AI agent means scattering config across `.opencode/plugins/`, `.claude/settings.json`, `.cursor/rules/` — different formats, different locations, different capabilities. If you switch agents, you start over. Tank solves this with **atoms**: a universal format that compiles to any platform.

## How It Works

```
                  tank.json
                     │
              ┌──────┴──────┐
              │  tank build  │
              └──────┬──────┘
       ┌─────────┬───┴───┬─────────┐
       ▼         ▼       ▼         ▼
   .opencode/  .claude/  .cursor/  .windsurf/
   (native)    (native)  (native)  (native)
```

You define **what** your skill does. Tank handles **where** each platform needs the files.

## 30-Second Quick Start

```bash
mkdir my-skill && cd my-skill
```

Create `tank.json`:

```json
{
  "name": "@yourorg/my-skill",
  "version": "1.0.0",
  "description": "Protects env files from being written by the agent",
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

Build:

```bash
tank build . --platform opencode --out ~/my-project
```

That's it. Tank generates the correct `.opencode/plugins/` files. Change `--platform claude-code` and it generates `.claude/settings.json` hooks instead. Same skill, different output.

## The 7 Atom Kinds

Each atom is a building block. Combine them to create anything from a simple instruction file to a full quality-gate system with hooks, agents, and review criteria.

| Atom            | What It Does                             | Think of It As                      |
| --------------- | ---------------------------------------- | ----------------------------------- |
| **instruction** | Injects knowledge into the agent's brain | A SKILL.md that works everywhere    |
| **hook**        | Runs code when the agent does something  | A git hook, but for AI agents       |
| **agent**       | Creates a sub-agent with specific skills | A specialist you can summon         |
| **tool**        | Registers an MCP server                  | Giving the agent a new superpower   |
| **rule**        | Blocks or allows specific actions        | A security guard with a checklist   |
| **resource**    | Makes a file available to the agent      | Putting a reference doc on the desk |
| **prompt**      | Defines a reusable prompt template       | A fill-in-the-blanks form           |

---

### 📄 instruction

The most common atom. Points to a markdown file that becomes part of the agent's context.

```json
{ "kind": "instruction", "content": "SKILL.md" }
```

Optional fields: `scope` (`"project"` / `"global"` / `"directory"`), `globs` (file patterns for directory scope).

**Where it goes:** OpenCode → `.opencode/instructions/`, Claude Code → `.claude/rules/`, Cursor → `.cursor/rules/*.mdc`, Windsurf → `.windsurfrules` (appended).

---

### ⚡ hook

The most powerful atom. Reacts to 37 agent events. Two flavors:

**DSL** — portable, no code, works on every platform:

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

**JS** — full code, for complex logic like the quality-gate:

```json
{
  "kind": "hook",
  "name": "quality-gate",
  "event": "pre-stop",
  "handler": { "type": "js", "entry": "hooks/quality-gate.ts" }
}
```

> **When to use which?** DSL for simple block/allow rules. JS when you need conditionals, git status checks, API calls, or multi-step logic.

---

### 🤖 agent

Defines a sub-agent the main agent can delegate to.

```json
{
  "kind": "agent",
  "name": "code-reviewer",
  "role": "Senior code reviewer. Focus on SOLID, KISS, and security.",
  "tools": ["file_read", "grep", "glob"],
  "model": "powerful",
  "readonly": true
}
```

Model tiers (`fast`, `balanced`, `powerful`) are abstract — each platform maps them to its own models. You never hardcode `claude-sonnet-4-20250514` in a portable skill.

---

### 🔧 tool

Registers an MCP server the agent can use.

```json
{
  "kind": "tool",
  "name": "my-analyzer",
  "mcp": {
    "command": "npx",
    "args": ["-y", "@myorg/analyzer-mcp"],
    "env": { "API_KEY": "${ANALYZER_KEY}" }
  }
}
```

**Where it goes:** OpenCode → `opencode.json`, Claude Code → `.mcp.json`, Cursor → `.cursor/mcp.json`.

---

### 🛡️ rule

Declarative guard — no code needed. Syntactic sugar that compiles to hooks internally.

```json
{
  "kind": "rule",
  "event": "pre-command",
  "match": "rm -rf",
  "policy": "block",
  "reason": "Dangerous destructive command"
}
```

Policies: `"block"` (hard stop), `"allow"` (explicit permit), `"warn"` (log and continue).

---

### 📎 resource

Declares a file the agent should have access to.

```json
{
  "kind": "resource",
  "name": "review-criteria",
  "uri": "references/review-criteria.md",
  "mimeType": "text/markdown"
}
```

---

### 💬 prompt

A reusable prompt template with named arguments.

```json
{
  "kind": "prompt",
  "name": "review",
  "template": "prompts/review.md",
  "arguments": [{ "name": "files", "required": true }, { "name": "severity" }]
}
```

---

## Platform Support Matrix

Not every platform supports every atom. Tank compiles what it can and warns about the rest — nothing silently disappears.

|                 | instruction | hook | agent | tool | rule | resource | prompt |
| --------------- | ----------- | ---- | ----- | ---- | ---- | -------- | ------ |
| **OpenCode**    | ✅          | ✅   | ✅    | ✅   | ✅   | ⚠️       | ✅     |
| **Claude Code** | ✅          | ✅   | 📝    | ✅   | ✅   | ⚠️       | ✅     |
| **Cursor**      | ✅          | ✅   | ✅    | ✅   | ✅   | ⚠️       | ⚠️     |
| **Windsurf**    | ✅          | ⚠️   | ⚠️    | ✅   | ⚠️   | ❌       | ❌     |
| **Cline**       | ✅          | ⚠️   | ⚠️    | ✅   | ⚠️   | ✅       | ✅     |
| **Roo Code**    | ✅          | ⚠️   | ✅    | ✅   | ⚠️   | ✅       | ✅     |

✅ = native &nbsp; 📝 = inlined into instructions &nbsp; ⚠️ = partial / degraded &nbsp; ❌ = skipped with warning

## Hook Events Reference

37 canonical events across 9 categories. Use the event name in hook and rule atoms.

| Category     | Events                                                                                                                                                                             |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **File**     | `pre-file-write` `post-file-write` `pre-file-read` `post-file-read` `pre-file-delete` `post-file-delete` `pre-file-rename` `post-file-rename` `pre-file-create` `post-file-create` |
| **Command**  | `pre-command` `post-command` `pre-bash` `post-bash` `pre-terminal` `post-terminal`                                                                                                 |
| **Tool**     | `pre-tool-call` `post-tool-call` `pre-mcp-call` `post-mcp-call`                                                                                                                    |
| **Session**  | `pre-start` `post-start` `pre-stop` `post-stop` `session-idle` `session-resume`                                                                                                    |
| **Agent**    | `pre-agent-spawn` `post-agent-spawn` `pre-agent-complete` `post-agent-complete`                                                                                                    |
| **Context**  | `pre-context-load` `post-context-load` `pre-context-switch` `post-context-switch`                                                                                                  |
| **Network**  | `pre-network` `post-network`                                                                                                                                                       |
| **Error**    | `on-error` `on-lint-error`                                                                                                                                                         |
| **Approval** | `pre-approval` `post-approval`                                                                                                                                                     |

> Not all platforms support all events. Unsupported events are skipped with a build warning — your skill still works, it just won't fire that particular hook on that platform.

## `tank build` Command

```bash
tank build <skill-dir> [options]
```

| Flag               | Default           | What it does                                                                 |
| ------------------ | ----------------- | ---------------------------------------------------------------------------- |
| `--platform <id>`  | auto-detect       | Target: `opencode`, `claude-code`, `cursor`, `windsurf`, `cline`, `roo-code` |
| `--out <dir>`      | current directory | Where to write the generated files                                           |
| `--dry-run`        | —                 | Preview files without writing anything                                       |
| `--list-platforms` | —                 | Show all available platforms                                                 |

**Auto-detection:** If you omit `--platform`, Tank checks the target directory for `.opencode/`, `.cursor/`, `.claude/`, `.windsurf/`, `.clinerules/`, or `.roo/` and picks the matching platform.

## Extensions (Platform-Specific Overrides)

Every atom accepts an `extensions` field for per-platform customization:

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

Each adapter reads only its own namespace. Extensions are optional and ignored by platforms that don't recognize them.

## Real-World Example: Quality Gate

A skill that reviews code quality before the agent finishes its session.

```
quality-gate/
├── tank.json          ← manifest with 3 atoms
├── SKILL.md           ← context for the agent
├── hooks/
│   └── quality-gate.ts  ← JS handler (checks git diff, triggers review)
└── references/
    └── review-criteria.md  ← scoring rubric
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

**Build for OpenCode:**

```bash
tank build ./quality-gate --platform opencode --out ~/my-project
```

**Output:**

```
.opencode/instructions/SKILL-md.md     ← instruction content
.opencode/plugins/quality-gate.ts       ← hook plugin
.opencode/agent/code-reviewer.md        ← agent definition
```

**Same skill, build for Claude Code:**

```bash
tank build ./quality-gate --platform claude-code --out ~/my-project
```

**Output:**

```
.claude/rules/SKILL-md.md              ← instruction content
.claude/hooks/quality-gate.mjs          ← JS hook wrapper
.claude/settings.json                   ← hook registration
.claude/agents/code-reviewer.md         ← agent file
```

Same input, completely different output. That's the point.

## Migrating from skills.json

Already have a skill with `skills.json` and `SKILL.md`? Migration takes 30 seconds:

1. Rename `skills.json` → `tank.json`
2. Add one line: `"atoms": [{ "kind": "instruction", "content": "SKILL.md" }]`
3. Done. Everything else (`name`, `version`, `skills`, `permissions`) stays identical.

Your skill now compiles to platform-native files instead of being symlinked as raw markdown.

## IDE Autocomplete

For VS Code, add to `.vscode/settings.json`:

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

This gives you autocomplete for every atom kind, event name, and field.
