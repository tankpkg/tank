# Adding a New Platform Adapter

This guide explains how to add support for a new AI coding agent platform to Tank's atom compilation system.

## Overview

Each adapter converts the 7 atom IR types into platform-native configuration files. Adapters live in `packages/adapters/src/adapters/<platform-id>.ts`.

## Steps

### 1. Create the adapter file

Create `packages/adapters/src/adapters/<platform-id>.ts`. Every adapter exports a `PlatformAdapter` object:

```typescript
import type { AdapterCapabilities, AtomIR, PlatformAdapter, PlatformOutput } from "@internals/schemas";

const capabilities: AdapterCapabilities = {
  instruction: "full", // 'full' | 'degraded' | 'none'
  hook: "full",
  tool: "full",
  agent: "full",
  rule: "full",
  resource: "degraded",
  prompt: "none",
};

export const myPlatformAdapter: PlatformAdapter = {
  name: "<platform-id>",
  supportedRange: ">=1.0.0",
  capabilities,
  compileAtom(atom: unknown): PlatformOutput {
    const a = atom as AtomIR;
    switch (a.kind) {
      case "instruction":
        return emitInstruction(a);
      case "hook":
        return emitHook(a);
      case "agent":
        return emitAgent(a);
      case "tool":
        return emitTool(a);
      case "rule":
        return emitRule(a);
      case "resource":
        return emitResource(a);
      case "prompt":
        return emitPrompt(a);
      default:
        return { files: [], warnings: [{ level: "skipped", atomKind: "unknown", message: "Unknown atom kind" }] };
    }
  },
};
```

### 2. Implement emit functions

Each `emit*` function receives a typed atom and returns `PlatformOutput`:

```typescript
interface PlatformOutput {
  files: Array<{ path: string; content: string }>;
  warnings: Array<{ level: "skipped" | "degraded"; atomKind: string; message: string }>;
}
```

- `files[].path` — relative to the project root (e.g., `.myplatform/rules/skill.md`)
- `files[].content` — file content. Use `{file:path}` for content that should be inlined from the skill source dir.
- `warnings` — report degraded support or skipped atoms. Never silently drop atoms.

### 3. Capability levels

| Level      | Meaning                                                  |
| ---------- | -------------------------------------------------------- |
| `full`     | Native platform support, compiles to idiomatic config    |
| `degraded` | Supported with caveats (e.g., inlined instead of native) |
| `none`     | Not supported, atom is skipped with a warning            |

### 4. Register the adapter

In `packages/adapters/src/index.ts`, export the adapter. In `packages/cli/src/commands/build.ts`, add it to the `ADAPTERS` map. In `compile.ts`, add its handler directory to `HANDLER_DIRS`.

### 5. Add E2E tests

Add the adapter to `e2e/atom-architecture/all-atoms-fixture.e2e.test.ts` (already iterates `ALL_ADAPTERS`) and verify it compiles the 7-atom fixture without errors.

### 6. Update docs

- Add the platform to the table in `docs/guide/atoms.md`
- Add auto-detection logic in `build.ts` `detectPlatform()`
- Update `llms.txt` supported platforms list

## File path conventions

| Platform    | Config root  | Instruction pattern           | Hook handler dir              |
| ----------- | ------------ | ----------------------------- | ----------------------------- |
| opencode    | `.opencode/` | `.opencode/instructions/*.md` | `.opencode/plugins/handlers/` |
| claude-code | `.claude/`   | `.claude/rules/*.md`          | `.claude/hooks/`              |
| cursor      | `.cursor/`   | `.cursor/rules/*.mdc`         | `.cursor/hooks/`              |
| windsurf    | `.windsurf/` | `.windsurfrules` (append)     | `.windsurf/hooks/`            |
| cline       | `.cline/`    | `.clinerules` (append)        | `.clinerules/hooks/`          |
| roo-code    | `.roo/`      | `.roo/rules/*.md`             | `.roo/hooks/`                 |

## Content inlining

Use `{file:relative/path}` in file content to reference source files. The compile orchestrator replaces these with actual file content at build time. Use this for instruction content that should be embedded rather than referenced.

## JSON deep-merge

When multiple atoms write to the same `.json` path (e.g., `.claude/settings.json` from both hook and tool atoms), the compile orchestrator deep-merges the JSON objects. Arrays are concatenated, objects are recursively merged, primitives take the last value.

## Reference implementations

Study the existing adapters in order of complexity:

1. `cursor.ts` — simplest, good starting point
2. `windsurf.ts` — shows append-style for single-file platforms
3. `opencode.ts` — shows plugin manifest generation
4. `claude-code.ts` — shows JS wrapper generation and settings.json merge
