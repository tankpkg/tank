# RFC: Universal Atom Architecture

**Status:** Phase 1 complete (schemas + tests shipped)
**Issue:** [#352](https://github.com/tankpkg/tank/issues/352)
**Intent:** `idd/modules/atom-architecture/INTENT.md`
**Tests:** `bdd/features/system/atom-architecture/` (33 passing)

## Problem

AI coding agents each have incompatible extension formats. Skill authors pick one platform and ignore the rest. Tank today only manages instruction blobs (`SKILL.md`). The ecosystem needs a universal abstraction that compiles to any target.

## Solution

Three-layer architecture inspired by Flutter:

```text
Author Layer (tank.json / tank.config.ts)
         │
         ▼
IR Layer (normalized atoms — Zod-validated)
         │
    ┌────┼────┐
    ▼    ▼    ▼
 Adapters (per-platform file generators)
```

## Atom Types

Seven canonical primitives. Each has a Zod schema in `packages/internals-schemas/src/schemas/atoms/`.

### InstructionIR

Persistent behavioral context injected into the agent.

```ts
import { instructionIRSchema } from "@internals/schemas";

instructionIRSchema.parse({
  kind: "instruction",
  content: "./rules/typescript.md",
  scope: "project",
  globs: ["**/*.ts", "**/*.tsx"],
  extensions: { cursor: { alwaysApply: true } },
});
```

| Field        | Type                                   | Required | Description                           |
| ------------ | -------------------------------------- | -------- | ------------------------------------- |
| `kind`       | `'instruction'`                        | yes      | Discriminator                         |
| `content`    | `string`                               | yes      | Path to content file                  |
| `scope`      | `'project' \| 'global' \| 'directory'` | no       | Activation scope                      |
| `globs`      | `string[]`                             | no       | File patterns that trigger activation |
| `extensions` | `Record<string, unknown>`              | no       | Platform-specific overrides           |

### HookIR

Code that runs at agent lifecycle points. Handler is a discriminated union: DSL (portable) or JS (escape hatch).

```ts
import { hookIRSchema } from "@internals/schemas";

// DSL handler — portable, preferred
hookIRSchema.parse({
  kind: "hook",
  event: "pre-tool-use",
  match: "bash",
  handler: {
    type: "dsl",
    actions: [{ action: "block", match: "rm -rf", reason: "Destructive command" }],
  },
});

// JS handler — escape hatch for advanced logic
hookIRSchema.parse({
  kind: "hook",
  event: "pre-tool-use",
  handler: { type: "js", entry: "./hooks/security-check.ts" },
});
```

| Field        | Type                      | Required | Description                 |
| ------------ | ------------------------- | -------- | --------------------------- |
| `kind`       | `'hook'`                  | yes      | Discriminator               |
| `name`       | `string`                  | no       | Human-readable label        |
| `event`      | `string`                  | yes      | Lifecycle event name        |
| `match`      | `string`                  | no       | Tool/pattern filter         |
| `handler`    | `HookHandlerIR`           | yes      | DSL actions or JS entry     |
| `scope`      | `'project' \| 'global'`   | no       | Activation scope            |
| `extensions` | `Record<string, unknown>` | no       | Platform-specific overrides |

**DSL actions:** `block`, `allow`, `rewrite`, `injectContext` — each with optional `match`, `reason`, `value`.

### ToolIR

Capability the agent can invoke (MCP server).

```ts
import { toolIRSchema } from "@internals/schemas";

toolIRSchema.parse({
  kind: "tool",
  name: "github",
  description: "GitHub API access",
  mcp: { command: "npx", args: ["-y", "@modelcontextprotocol/server-github"] },
});
```

### AgentIR

Named role with specific instructions, tools, and permissions.

```ts
import { agentIRSchema } from "@internals/schemas";

agentIRSchema.parse({
  kind: "agent",
  name: "security-auditor",
  role: "Security specialist for auth, payments, and sensitive data",
  tools: ["read", "grep", "glob"],
  model: "fast",
  readonly: true,
});
```

### RuleIR

Machine-enforced validation constraint.

```ts
import { ruleIRSchema } from "@internals/schemas";

ruleIRSchema.parse({
  kind: "rule",
  event: "pre-tool-use",
  match: "bash",
  policy: "block",
  reason: "Destructive commands are not allowed",
});
```

### ResourceIR

Data or context the agent can read.

```ts
import { resourceIRSchema } from "@internals/schemas";

resourceIRSchema.parse({
  kind: "resource",
  uri: "docs://api-reference",
  description: "API documentation",
  mimeType: "text/markdown",
});
```

### PromptIR

Reusable invocable template (slash command, workflow).

```ts
import { promptIRSchema } from "@internals/schemas";

promptIRSchema.parse({
  kind: "prompt",
  name: "deploy",
  description: "Deploy to production with safety checks",
  template: "./prompts/deploy.md",
  arguments: [{ name: "environment", description: "Target environment", required: true }],
});
```

## PackageIR

Composable container of atoms. Can reference other packages via `includes`.

```ts
import { packageIRSchema } from "@internals/schemas";

packageIRSchema.parse({
  name: "@acme/security-suite",
  version: "1.0.0",
  description: "Security hooks, rules, and auditor agent",
  includes: ["@acme/base-rules"],
  atoms: [
    { kind: "instruction", content: "./rules/security.md" },
    { kind: "hook", event: "pre-tool-use", handler: { type: "dsl", actions: [{ action: "block", match: "rm -rf" }] } },
    { kind: "agent", name: "auditor", role: "Security auditor", tools: ["read", "grep"] },
  ],
});
```

## Adapter Contract

Each adapter declares capabilities and translates IR atoms to platform-specific files.

### Capabilities

```ts
import { adapterCapabilitiesSchema } from "@internals/schemas";

adapterCapabilitiesSchema.parse({
  instruction: "full",
  hook: "degraded",
  tool: "full",
  agent: "none",
  rule: "degraded",
  resource: "full",
  prompt: "full",
});
```

| Level      | Behavior                                         |
| ---------- | ------------------------------------------------ |
| `full`     | Translate faithfully to native platform format   |
| `degraded` | Approximate to closest equivalent + emit warning |
| `none`     | Skip atom entirely + emit warning                |

### PlatformOutput

Every adapter method returns files to write and warnings to surface.

```ts
import { platformOutputSchema } from "@internals/schemas";

platformOutputSchema.parse({
  files: [{ path: ".cursor/rules/security.mdc", content: "---\nalwaysApply: true\n---\n..." }],
  warnings: [{ level: "degraded", atomKind: "hook", message: "Hook approximated as instruction rule" }],
});
```

### PlatformAdapter Interface

```ts
import type { PlatformAdapter } from "@internals/schemas";

const cursorAdapter: PlatformAdapter = {
  name: "cursor",
  supportedRange: ">=2.4.0 <3.0.0",
  capabilities: {
    instruction: "full",
    hook: "full",
    tool: "full",
    agent: "full",
    rule: "degraded",
    resource: "partial",
    prompt: "full",
  },
  compileAtom(atom) {
    // Route by atom.kind → platform-specific file generation
    return { files: [], warnings: [] };
  },
};
```

### Version Compatibility

Adapters declare a semver range for the target platform. Standard `semver.satisfies()` check.

```ts
import semver from "semver";

const supported = ">=2.4.0 <3.0.0";
semver.satisfies("2.5.0", supported); // true
semver.satisfies("3.1.0", supported); // false
```

## Authoring Tiers

### Tier 1: Declarative (tank.json)

No build step. Author defines atoms directly in the manifest.

```json
{
  "name": "@acme/ts-rules",
  "version": "1.0.0",
  "atoms": [
    { "kind": "instruction", "content": "./SKILL.md", "globs": ["**/*.ts"] },
    { "kind": "agent", "name": "reviewer", "role": "Code reviewer", "tools": ["read"] }
  ]
}
```

### Tier 2: Programmatic (tank.config.ts)

Build step required. For hooks with logic and dynamic composition.

```ts
import { definePackage, hook, instruction } from "@tankpkg/<new-sdk>";

export default definePackage({
  name: "@acme/security",
  atoms: [
    instruction({ content: "./rules.md", scope: "project" }),
    hook({
      event: "pre-tool-use",
      match: "bash",
      handler: async (ctx) => {
        if (ctx.args.command.includes("rm -rf")) return { block: true, reason: "Destructive" };
      },
    }),
  ],
});
```

### Legacy: SKILL.md (backward compatible)

A package with `SKILL.md` and `tank.json` (no `atoms` field) normalizes to a single-instruction `PackageIR`. Zero migration required.

## Compilation Model

| Mode | Trigger                       | Output                | Runtime dependency |
| ---- | ----------------------------- | --------------------- | ------------------ |
| AOT  | `tank build` / `tank install` | Static platform files | None               |
| JIT  | Tank daemon watches source    | Hot-reload on change  | Tank daemon        |

## Adapter Distribution

| Tier      | Adapters                                                 | Delivery                       |
| --------- | -------------------------------------------------------- | ------------------------------ |
| Core      | Claude Code, Cursor, OpenCode, Windsurf, Cline, Roo Code | Bundled in CLI                 |
| Community | Aider, Continue, niche targets                           | Installable from Tank registry |

## Design Decisions

| Decision           | Choice                                        | Rationale                                                              |
| ------------------ | --------------------------------------------- | ---------------------------------------------------------------------- |
| IR shape           | Normalized core + extensions                  | Clean abstraction; platform details in extension bags                  |
| Hook handlers      | DSL + JS escape hatch                         | Portability for common cases; full power when needed                   |
| Hookless platforms | Skip + warn                                   | No runtime shim in v1; keeps architecture clean                        |
| Testing            | IDD / BDD / real E2E                          | Bulletproof methodology; 33 scenarios verified                         |
| Version compat     | Adapter declares semver range                 | Industry standard (VS Code engines, npm peerDeps, Terraform providers) |
| Package ownership  | New SDK package, separate from `@tankpkg/sdk` | Current SDK is registry client; authoring is a different concern       |

## File Map

| Path                                                                  | Contents                              |
| --------------------------------------------------------------------- | ------------------------------------- |
| `packages/internals-schemas/src/schemas/atoms/base.ts`                | `AtomKind` enum, `ExtensionBag`       |
| `packages/internals-schemas/src/schemas/atoms/instruction.ts`         | `InstructionIR`                       |
| `packages/internals-schemas/src/schemas/atoms/hook.ts`                | `HookIR`, `HookHandlerIR` (DSL + JS)  |
| `packages/internals-schemas/src/schemas/atoms/tool.ts`                | `ToolIR`, `McpServerConfig`           |
| `packages/internals-schemas/src/schemas/atoms/agent.ts`               | `AgentIR`                             |
| `packages/internals-schemas/src/schemas/atoms/rule.ts`                | `RuleIR`                              |
| `packages/internals-schemas/src/schemas/atoms/resource.ts`            | `ResourceIR`                          |
| `packages/internals-schemas/src/schemas/atoms/prompt.ts`              | `PromptIR`                            |
| `packages/internals-schemas/src/schemas/atoms/package.ts`             | `PackageIR`, `AtomIR` union           |
| `packages/internals-schemas/src/schemas/adapters/capabilities.ts`     | `SupportLevel`, `AdapterCapabilities` |
| `packages/internals-schemas/src/schemas/adapters/platform-adapter.ts` | `PlatformOutput`, `PlatformAdapter`   |
| `idd/modules/atom-architecture/INTENT.md`                             | Behavioral contract                   |
| `bdd/features/system/atom-architecture/*.feature`                     | 4 Gherkin feature files               |
| `bdd/steps/system/atom-architecture.steps.ts`                         | 33 passing tests                      |

## Next Steps (Phase 2+)

1. Create new authoring SDK package (name TBD) with `definePackage()` and builder functions
2. Implement normalization pipeline (tank.json/tank.config.ts/SKILL.md → PackageIR)
3. Build first adapter (Claude Code — richest target)
4. Build OpenCode and Cursor adapters
5. Add `tank build` command to CLI
6. JIT daemon with file watching
