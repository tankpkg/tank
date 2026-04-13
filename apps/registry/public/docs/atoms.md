---
title: Building Multi-Atom Skills
description: Write one tank.json with 7 atom kinds — instructions, hooks, agents, tools, rules, resources, prompts — and tank build compiles them to native configs for 6 AI coding agent platforms.
---

> **Tank skills are portable.** Write a `tank.json` once, run `tank build`, and Tank compiles it into native config files for OpenCode, Claude Code, Cursor, Windsurf, Cline, or Roo Code. No manual platform wiring.

Today, teaching something to your AI agent means scattering config across `.opencode/plugins/`, `.claude/settings.json`, `.cursor/rules/` — different formats, different locations, different capabilities. If you switch agents, you start over. Tank solves this with **atoms**: a universal format that compiles to any platform.

## How It Works

<div style="margin: 2rem 0; display: flex; justify-content: center; overflow-x: auto;">
<svg viewBox="0 0 720 280" xmlns="http://www.w3.org/2000/svg" class="max-w-full" style="font-family: 'Space Grotesk', sans-serif;">
  <!-- Source files group -->
  <rect x="175" y="8" width="370" height="56" rx="12" fill="none" stroke="#10b981" stroke-width="1.5" stroke-dasharray="6,3"/>
  <text x="360" y="28" text-anchor="middle" fill="#64748b" font-size="10" font-weight="600">YOUR SKILL</text>
  <rect x="190" y="34" width="110" height="24" rx="5" fill="#10b981" fill-opacity="0.1" stroke="#10b981" stroke-width="1"/>
  <text x="245" y="50" text-anchor="middle" fill="#10b981" font-size="11" font-weight="600">tank.json</text>
  <rect x="310" y="34" width="110" height="24" rx="5" fill="none" stroke="currentColor" stroke-width="1" stroke-opacity="0.3"/>
  <text x="365" y="50" text-anchor="middle" fill="currentColor" font-size="11">hooks/*.ts</text>
  <rect x="430" y="34" width="100" height="24" rx="5" fill="none" stroke="currentColor" stroke-width="1" stroke-opacity="0.3"/>
  <text x="480" y="50" text-anchor="middle" fill="currentColor" font-size="11">SKILL.md</text>
  <!-- Arrow down -->
  <line x1="360" y1="64" x2="360" y2="100" stroke="#64748b" stroke-width="1.5"/>
  <polygon points="354,96 360,106 366,96" fill="#64748b"/>
  <!-- tank build box -->
  <rect x="280" y="106" width="160" height="44" rx="8" fill="#10b981" fill-opacity="0.1" stroke="#10b981" stroke-width="1.5"/>
  <text x="360" y="133" text-anchor="middle" fill="#10b981" font-size="14" font-weight="600">tank build</text>
  <!-- Fan-out arrows -->
  <line x1="310" y1="150" x2="80" y2="200" stroke="#64748b" stroke-width="1.2"/>
  <polygon points="76,196 80,206 86,198" fill="#64748b"/>
  <line x1="340" y1="150" x2="240" y2="200" stroke="#64748b" stroke-width="1.2"/>
  <polygon points="236,196 240,206 246,198" fill="#64748b"/>
  <line x1="380" y1="150" x2="480" y2="200" stroke="#64748b" stroke-width="1.2"/>
  <polygon points="474,198 480,206 484,196" fill="#64748b"/>
  <line x1="410" y1="150" x2="640" y2="200" stroke="#64748b" stroke-width="1.2"/>
  <polygon points="634,198 640,206 644,196" fill="#64748b"/>
  <!-- Platform boxes -->
  <rect x="20" y="206" width="120" height="54" rx="8" fill="none" stroke="currentColor" stroke-width="1" stroke-opacity="0.3"/>
  <text x="80" y="228" text-anchor="middle" fill="currentColor" font-size="11" font-weight="600">.opencode/</text>
  <text x="80" y="246" text-anchor="middle" fill="#64748b" font-size="10">plugins, agents, mcp</text>
  <rect x="180" y="206" width="120" height="54" rx="8" fill="none" stroke="currentColor" stroke-width="1" stroke-opacity="0.3"/>
  <text x="240" y="228" text-anchor="middle" fill="currentColor" font-size="11" font-weight="600">.claude/</text>
  <text x="240" y="246" text-anchor="middle" fill="#64748b" font-size="10">hooks, rules, agents</text>
  <rect x="420" y="206" width="120" height="54" rx="8" fill="none" stroke="currentColor" stroke-width="1" stroke-opacity="0.3"/>
  <text x="480" y="228" text-anchor="middle" fill="currentColor" font-size="11" font-weight="600">.cursor/</text>
  <text x="480" y="246" text-anchor="middle" fill="#64748b" font-size="10">rules, mcp, agents</text>
  <rect x="580" y="206" width="120" height="54" rx="8" fill="none" stroke="currentColor" stroke-width="1" stroke-opacity="0.3"/>
  <text x="640" y="228" text-anchor="middle" fill="currentColor" font-size="11" font-weight="600">.windsurf/</text>
  <text x="640" y="246" text-anchor="middle" fill="#64748b" font-size="10">rules, mcp config</text>
</svg>
</div>

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

<div style="margin: 2rem 0; display: flex; justify-content: center; overflow-x: auto;">
<svg viewBox="0 0 560 280" xmlns="http://www.w3.org/2000/svg" class="max-w-full" style="font-family: 'Space Grotesk', sans-serif;">
  <!-- Row 1 -->
  <rect x="10" y="10" width="170" height="58" rx="8" fill="#10b981" fill-opacity="0.08" stroke="#10b981" stroke-width="1.5"/>
  <text x="30" y="36" fill="#10b981" font-size="16">📄</text>
  <text x="52" y="35" fill="currentColor" font-size="12" font-weight="600">instruction</text>
  <text x="30" y="52" fill="#64748b" font-size="10">Knowledge for the agent</text>
  <rect x="195" y="10" width="170" height="58" rx="8" fill="#10b981" fill-opacity="0.08" stroke="#10b981" stroke-width="1.5"/>
  <text x="215" y="36" fill="#10b981" font-size="16">⚡</text>
  <text x="237" y="35" fill="currentColor" font-size="12" font-weight="600">hook</text>
  <text x="215" y="52" fill="#64748b" font-size="10">Code on 37 agent events</text>
  <rect x="380" y="10" width="170" height="58" rx="8" fill="#10b981" fill-opacity="0.08" stroke="#10b981" stroke-width="1.5"/>
  <text x="400" y="36" fill="#10b981" font-size="16">🤖</text>
  <text x="422" y="35" fill="currentColor" font-size="12" font-weight="600">agent</text>
  <text x="400" y="52" fill="#64748b" font-size="10">Specialist sub-agent</text>
  <!-- Row 2 -->
  <rect x="10" y="80" width="170" height="58" rx="8" fill="none" stroke="currentColor" stroke-width="1" stroke-opacity="0.2"/>
  <text x="30" y="106" fill="currentColor" font-size="16">🔧</text>
  <text x="52" y="105" fill="currentColor" font-size="12" font-weight="600">tool</text>
  <text x="30" y="122" fill="#64748b" font-size="10">Registers an MCP server</text>
  <rect x="195" y="80" width="170" height="58" rx="8" fill="none" stroke="currentColor" stroke-width="1" stroke-opacity="0.2"/>
  <text x="215" y="106" fill="currentColor" font-size="16">🛡️</text>
  <text x="237" y="105" fill="currentColor" font-size="12" font-weight="600">rule</text>
  <text x="215" y="122" fill="#64748b" font-size="10">Block / allow / warn policy</text>
  <!-- Row 3 -->
  <rect x="10" y="150" width="170" height="58" rx="8" fill="none" stroke="currentColor" stroke-width="1" stroke-opacity="0.2"/>
  <text x="30" y="176" fill="currentColor" font-size="16">📎</text>
  <text x="52" y="175" fill="currentColor" font-size="12" font-weight="600">resource</text>
  <text x="30" y="192" fill="#64748b" font-size="10">File or URI for the agent</text>
  <rect x="195" y="150" width="170" height="58" rx="8" fill="none" stroke="currentColor" stroke-width="1" stroke-opacity="0.2"/>
  <text x="215" y="176" fill="currentColor" font-size="16">💬</text>
  <text x="237" y="175" fill="currentColor" font-size="12" font-weight="600">prompt</text>
  <text x="215" y="192" fill="#64748b" font-size="10">Template with arguments</text>
  <!-- Bottom annotation - centered -->
  <text x="280" y="240" text-anchor="middle" fill="#10b981" font-size="12" font-weight="600">Mix and match — 1 atom or all 7. Every combination compiles to every platform.</text>
  <line x1="80" y1="250" x2="480" y2="250" stroke="#10b981" stroke-width="1" stroke-opacity="0.2"/>
  <text x="180" y="270" text-anchor="middle" fill="#64748b" font-size="10">1 atom → simple skill</text>
  <text x="280" y="270" text-anchor="middle" fill="#64748b" font-size="10">·</text>
  <text x="380" y="270" text-anchor="middle" fill="#64748b" font-size="10">3 atoms → quality gate</text>
</svg>
</div>

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

<div style="margin: 2rem 0; display: flex; justify-content: center; overflow-x: auto;">
<svg viewBox="0 0 760 310" xmlns="http://www.w3.org/2000/svg" class="max-w-full" style="font-family: 'Space Grotesk', sans-serif;">
  <!-- Column headers -->
  <text x="140" y="24" text-anchor="middle" fill="#64748b" font-size="10" font-weight="600">instruction</text>
  <text x="230" y="24" text-anchor="middle" fill="#64748b" font-size="10" font-weight="600">hook</text>
  <text x="320" y="24" text-anchor="middle" fill="#64748b" font-size="10" font-weight="600">agent</text>
  <text x="410" y="24" text-anchor="middle" fill="#64748b" font-size="10" font-weight="600">tool</text>
  <text x="500" y="24" text-anchor="middle" fill="#64748b" font-size="10" font-weight="600">rule</text>
  <text x="590" y="24" text-anchor="middle" fill="#64748b" font-size="10" font-weight="600">resource</text>
  <text x="680" y="24" text-anchor="middle" fill="#64748b" font-size="10" font-weight="600">prompt</text>
  <!-- Row separator -->
  <line x1="20" y1="35" x2="740" y2="35" stroke="currentColor" stroke-opacity="0.1" stroke-width="1"/>
  <!-- OpenCode row -->
  <text x="55" y="60" text-anchor="middle" fill="currentColor" font-size="12" font-weight="600">OpenCode</text>
  <circle cx="140" cy="56" r="8" fill="#10b981" fill-opacity="0.15" stroke="#10b981" stroke-width="1.5"/><text x="140" y="60" text-anchor="middle" fill="#10b981" font-size="10">✓</text>
  <circle cx="230" cy="56" r="8" fill="#10b981" fill-opacity="0.15" stroke="#10b981" stroke-width="1.5"/><text x="230" y="60" text-anchor="middle" fill="#10b981" font-size="10">✓</text>
  <circle cx="320" cy="56" r="8" fill="#10b981" fill-opacity="0.15" stroke="#10b981" stroke-width="1.5"/><text x="320" y="60" text-anchor="middle" fill="#10b981" font-size="10">✓</text>
  <circle cx="410" cy="56" r="8" fill="#10b981" fill-opacity="0.15" stroke="#10b981" stroke-width="1.5"/><text x="410" y="60" text-anchor="middle" fill="#10b981" font-size="10">✓</text>
  <circle cx="500" cy="56" r="8" fill="#10b981" fill-opacity="0.15" stroke="#10b981" stroke-width="1.5"/><text x="500" y="60" text-anchor="middle" fill="#10b981" font-size="10">✓</text>
  <circle cx="590" cy="56" r="8" fill="#eab308" fill-opacity="0.12" stroke="#eab308" stroke-width="1.2"/><text x="590" y="60" text-anchor="middle" fill="#eab308" font-size="10">~</text>
  <circle cx="680" cy="56" r="8" fill="#10b981" fill-opacity="0.15" stroke="#10b981" stroke-width="1.5"/><text x="680" y="60" text-anchor="middle" fill="#10b981" font-size="10">✓</text>
  <!-- Claude Code row -->
  <line x1="20" y1="75" x2="740" y2="75" stroke="currentColor" stroke-opacity="0.05" stroke-width="1"/>
  <text x="55" y="100" text-anchor="middle" fill="currentColor" font-size="12" font-weight="600">Claude Code</text>
  <circle cx="140" cy="96" r="8" fill="#10b981" fill-opacity="0.15" stroke="#10b981" stroke-width="1.5"/><text x="140" y="100" text-anchor="middle" fill="#10b981" font-size="10">✓</text>
  <circle cx="230" cy="96" r="8" fill="#10b981" fill-opacity="0.15" stroke="#10b981" stroke-width="1.5"/><text x="230" y="100" text-anchor="middle" fill="#10b981" font-size="10">✓</text>
  <circle cx="320" cy="96" r="8" fill="#3b82f6" fill-opacity="0.12" stroke="#3b82f6" stroke-width="1.2"/><text x="320" y="100" text-anchor="middle" fill="#3b82f6" font-size="9">📝</text>
  <circle cx="410" cy="96" r="8" fill="#10b981" fill-opacity="0.15" stroke="#10b981" stroke-width="1.5"/><text x="410" y="100" text-anchor="middle" fill="#10b981" font-size="10">✓</text>
  <circle cx="500" cy="96" r="8" fill="#10b981" fill-opacity="0.15" stroke="#10b981" stroke-width="1.5"/><text x="500" y="100" text-anchor="middle" fill="#10b981" font-size="10">✓</text>
  <circle cx="590" cy="96" r="8" fill="#eab308" fill-opacity="0.12" stroke="#eab308" stroke-width="1.2"/><text x="590" y="100" text-anchor="middle" fill="#eab308" font-size="10">~</text>
  <circle cx="680" cy="96" r="8" fill="#10b981" fill-opacity="0.15" stroke="#10b981" stroke-width="1.5"/><text x="680" y="100" text-anchor="middle" fill="#10b981" font-size="10">✓</text>
  <!-- Cursor row -->
  <line x1="20" y1="115" x2="740" y2="115" stroke="currentColor" stroke-opacity="0.05" stroke-width="1"/>
  <text x="55" y="140" text-anchor="middle" fill="currentColor" font-size="12" font-weight="600">Cursor</text>
  <circle cx="140" cy="136" r="8" fill="#10b981" fill-opacity="0.15" stroke="#10b981" stroke-width="1.5"/><text x="140" y="140" text-anchor="middle" fill="#10b981" font-size="10">✓</text>
  <circle cx="230" cy="136" r="8" fill="#10b981" fill-opacity="0.15" stroke="#10b981" stroke-width="1.5"/><text x="230" y="140" text-anchor="middle" fill="#10b981" font-size="10">✓</text>
  <circle cx="320" cy="136" r="8" fill="#10b981" fill-opacity="0.15" stroke="#10b981" stroke-width="1.5"/><text x="320" y="140" text-anchor="middle" fill="#10b981" font-size="10">✓</text>
  <circle cx="410" cy="136" r="8" fill="#10b981" fill-opacity="0.15" stroke="#10b981" stroke-width="1.5"/><text x="410" y="140" text-anchor="middle" fill="#10b981" font-size="10">✓</text>
  <circle cx="500" cy="136" r="8" fill="#10b981" fill-opacity="0.15" stroke="#10b981" stroke-width="1.5"/><text x="500" y="140" text-anchor="middle" fill="#10b981" font-size="10">✓</text>
  <circle cx="590" cy="136" r="8" fill="#eab308" fill-opacity="0.12" stroke="#eab308" stroke-width="1.2"/><text x="590" y="140" text-anchor="middle" fill="#eab308" font-size="10">~</text>
  <circle cx="680" cy="136" r="8" fill="#eab308" fill-opacity="0.12" stroke="#eab308" stroke-width="1.2"/><text x="680" y="140" text-anchor="middle" fill="#eab308" font-size="10">~</text>
  <!-- Windsurf row -->
  <line x1="20" y1="155" x2="740" y2="155" stroke="currentColor" stroke-opacity="0.05" stroke-width="1"/>
  <text x="55" y="180" text-anchor="middle" fill="currentColor" font-size="12" font-weight="600">Windsurf</text>
  <circle cx="140" cy="176" r="8" fill="#10b981" fill-opacity="0.15" stroke="#10b981" stroke-width="1.5"/><text x="140" y="180" text-anchor="middle" fill="#10b981" font-size="10">✓</text>
  <circle cx="230" cy="176" r="8" fill="#eab308" fill-opacity="0.12" stroke="#eab308" stroke-width="1.2"/><text x="230" y="180" text-anchor="middle" fill="#eab308" font-size="10">~</text>
  <circle cx="320" cy="176" r="8" fill="#eab308" fill-opacity="0.12" stroke="#eab308" stroke-width="1.2"/><text x="320" y="180" text-anchor="middle" fill="#eab308" font-size="10">~</text>
  <circle cx="410" cy="176" r="8" fill="#10b981" fill-opacity="0.15" stroke="#10b981" stroke-width="1.5"/><text x="410" y="180" text-anchor="middle" fill="#10b981" font-size="10">✓</text>
  <circle cx="500" cy="176" r="8" fill="#eab308" fill-opacity="0.12" stroke="#eab308" stroke-width="1.2"/><text x="500" y="180" text-anchor="middle" fill="#eab308" font-size="10">~</text>
  <circle cx="590" cy="176" r="8" fill="#dc2626" fill-opacity="0.1" stroke="#dc2626" stroke-width="1.2"/><text x="590" y="180" text-anchor="middle" fill="#dc2626" font-size="10">✗</text>
  <circle cx="680" cy="176" r="8" fill="#dc2626" fill-opacity="0.1" stroke="#dc2626" stroke-width="1.2"/><text x="680" y="180" text-anchor="middle" fill="#dc2626" font-size="10">✗</text>
  <!-- Cline row -->
  <line x1="20" y1="195" x2="740" y2="195" stroke="currentColor" stroke-opacity="0.05" stroke-width="1"/>
  <text x="55" y="220" text-anchor="middle" fill="currentColor" font-size="12" font-weight="600">Cline</text>
  <circle cx="140" cy="216" r="8" fill="#10b981" fill-opacity="0.15" stroke="#10b981" stroke-width="1.5"/><text x="140" y="220" text-anchor="middle" fill="#10b981" font-size="10">✓</text>
  <circle cx="230" cy="216" r="8" fill="#eab308" fill-opacity="0.12" stroke="#eab308" stroke-width="1.2"/><text x="230" y="220" text-anchor="middle" fill="#eab308" font-size="10">~</text>
  <circle cx="320" cy="216" r="8" fill="#eab308" fill-opacity="0.12" stroke="#eab308" stroke-width="1.2"/><text x="320" y="220" text-anchor="middle" fill="#eab308" font-size="10">~</text>
  <circle cx="410" cy="216" r="8" fill="#10b981" fill-opacity="0.15" stroke="#10b981" stroke-width="1.5"/><text x="410" y="220" text-anchor="middle" fill="#10b981" font-size="10">✓</text>
  <circle cx="500" cy="216" r="8" fill="#eab308" fill-opacity="0.12" stroke="#eab308" stroke-width="1.2"/><text x="500" y="220" text-anchor="middle" fill="#eab308" font-size="10">~</text>
  <circle cx="590" cy="216" r="8" fill="#10b981" fill-opacity="0.15" stroke="#10b981" stroke-width="1.5"/><text x="590" y="220" text-anchor="middle" fill="#10b981" font-size="10">✓</text>
  <circle cx="680" cy="216" r="8" fill="#10b981" fill-opacity="0.15" stroke="#10b981" stroke-width="1.5"/><text x="680" y="220" text-anchor="middle" fill="#10b981" font-size="10">✓</text>
  <!-- Roo Code row -->
  <line x1="20" y1="235" x2="740" y2="235" stroke="currentColor" stroke-opacity="0.05" stroke-width="1"/>
  <text x="55" y="260" text-anchor="middle" fill="currentColor" font-size="12" font-weight="600">Roo Code</text>
  <circle cx="140" cy="256" r="8" fill="#10b981" fill-opacity="0.15" stroke="#10b981" stroke-width="1.5"/><text x="140" y="260" text-anchor="middle" fill="#10b981" font-size="10">✓</text>
  <circle cx="230" cy="256" r="8" fill="#eab308" fill-opacity="0.12" stroke="#eab308" stroke-width="1.2"/><text x="230" y="260" text-anchor="middle" fill="#eab308" font-size="10">~</text>
  <circle cx="320" cy="256" r="8" fill="#10b981" fill-opacity="0.15" stroke="#10b981" stroke-width="1.5"/><text x="320" y="260" text-anchor="middle" fill="#10b981" font-size="10">✓</text>
  <circle cx="410" cy="256" r="8" fill="#10b981" fill-opacity="0.15" stroke="#10b981" stroke-width="1.5"/><text x="410" y="260" text-anchor="middle" fill="#10b981" font-size="10">✓</text>
  <circle cx="500" cy="256" r="8" fill="#eab308" fill-opacity="0.12" stroke="#eab308" stroke-width="1.2"/><text x="500" y="260" text-anchor="middle" fill="#eab308" font-size="10">~</text>
  <circle cx="590" cy="256" r="8" fill="#10b981" fill-opacity="0.15" stroke="#10b981" stroke-width="1.5"/><text x="590" y="260" text-anchor="middle" fill="#10b981" font-size="10">✓</text>
  <circle cx="680" cy="256" r="8" fill="#10b981" fill-opacity="0.15" stroke="#10b981" stroke-width="1.5"/><text x="680" y="260" text-anchor="middle" fill="#10b981" font-size="10">✓</text>
  <!-- Legend -->
  <circle cx="180" cy="295" r="6" fill="#10b981" fill-opacity="0.15" stroke="#10b981" stroke-width="1.2"/><text x="180" y="299" text-anchor="middle" fill="#10b981" font-size="8">✓</text>
  <text x="198" y="299" fill="#64748b" font-size="10">native</text>
  <circle cx="280" cy="295" r="6" fill="#eab308" fill-opacity="0.12" stroke="#eab308" stroke-width="1.2"/><text x="280" y="299" text-anchor="middle" fill="#eab308" font-size="8">~</text>
  <text x="298" y="299" fill="#64748b" font-size="10">partial</text>
  <circle cx="370" cy="295" r="6" fill="#3b82f6" fill-opacity="0.12" stroke="#3b82f6" stroke-width="1.2"/><text x="370" y="299" text-anchor="middle" fill="#3b82f6" font-size="7">📝</text>
  <text x="388" y="299" fill="#64748b" font-size="10">inlined</text>
  <circle cx="460" cy="295" r="6" fill="#dc2626" fill-opacity="0.1" stroke="#dc2626" stroke-width="1.2"/><text x="460" y="299" text-anchor="middle" fill="#dc2626" font-size="8">✗</text>
  <text x="478" y="299" fill="#64748b" font-size="10">skipped</text>
</svg>
</div>

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
