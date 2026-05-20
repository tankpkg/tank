# Atom Architecture

## Anchor

**Why this module exists:** Tank manages AI agent extensions today as monolithic
skill blobs (a `SKILL.md` instruction file + `tank.json` manifest). But AI agents
use 7 distinct atomic primitives — instructions, hooks, tools, agents, rules,
resources, and prompts — each with platform-specific config formats across 8+
editors. This module defines the canonical intermediate representation (IR) for
all 7 atom types, an adapter contract that compiles IR to platform-specific
output, and a normalization pipeline that converts author input (legacy SKILL.md,
declarative tank.json, programmatic tank.config.ts) into canonical IR.

**Consumers:** CLI (`tank build`, `tank install`), MCP server, registry (publish
validation), platform adapters (Claude Code, Cursor, OpenCode, Windsurf, Cline,
Roo Code, community adapters).

**Single source of truth:**

```
packages/internals-schemas/src/schemas/atoms/     # Zod IR schemas for all 7 atom types
packages/internals-schemas/src/schemas/adapters/   # Adapter contract, capabilities, platform target
packages/<new-sdk>/src/normalize/                  # Author input → IR normalization
packages/<new-sdk>/src/builders/                   # definePackage(), instruction(), hook(), etc.
```

---

## Layer 1: Structure

```
packages/
  internals-schemas/src/schemas/
    atoms/
      base.ts              # AtomKind enum, BaseAtomIR, ExtensionBag
      instruction.ts       # InstructionIR
      hook.ts              # HookIR, HookHandlerIR (DSL + JS variants)
      tool.ts              # ToolIR
      agent.ts             # AgentIR
      rule.ts              # RuleIR
      resource.ts          # ResourceIR
      prompt.ts            # PromptIR
      package.ts           # PackageIR (composable DAG of atoms + includes)
      index.ts             # barrel export
    adapters/
      capabilities.ts      # SupportLevel, AdapterCapabilities
      platform-adapter.ts  # PlatformAdapter interface, PlatformOutput
      index.ts             # barrel export
```

---

## Layer 2: Constraints

### IR Schema Constraints

| #   | Rule                                                                                          | Rationale                                                      | Verified by   |
| --- | --------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ------------- |
| C1  | Every atom IR has a `kind` discriminator field matching one of the 7 `AtomKind` values        | Enables discriminated unions and adapter routing               | BDD scenario  |
| C2  | Every atom IR has an optional `extensions` bag typed as `Record<string, unknown>`             | Platform-specific details live here, not in the canonical core | BDD assertion |
| C3  | Canonical core fields are strict — unknown keys rejected by Zod `.strict()` on the core shape | Prevents IR pollution with platform-specific concepts          | BDD scenario  |
| C4  | `HookHandlerIR` is a discriminated union: `{ type: 'dsl' }` or `{ type: 'js' }`               | Adapters prefer DSL; JS is an escape hatch for advanced logic  | BDD assertion |
| C5  | `PackageIR` contains `atoms: AtomIR[]` and optional `includes: string[]` (package references) | Packages are composable DAGs                                   | BDD scenario  |
| C6  | `PackageIR.name` must match the scoped name pattern `@org/name`                               | Consistent with existing `skillsJsonSchema` naming convention  | BDD scenario  |
| C7  | `PackageIR.version` must be valid semver                                                      | Consistent with existing registry versioning                   | BDD assertion |

### Adapter Contract Constraints

| #   | Rule                                                                                              | Rationale                                                                       | Verified by   |
| --- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------- | ---------------------------------------------------- | ------------- |
| C8  | `PlatformAdapter` must declare `capabilities` for all 7 atom kinds                                | Callers know what's supported before invoking translation                       | BDD assertion |
| C9  | `SupportLevel` is exactly `'full'                                                                 | 'degraded'                                                                      | 'none'`       | Three states: translate, approximate+warn, skip+warn | BDD assertion |
| C10 | When capability is `'none'`, the adapter's translation function returns an empty `PlatformOutput` | Skip semantics — no files generated                                             | BDD scenario  |
| C11 | When capability is `'degraded'`, `PlatformOutput` includes warning metadata                       | User sees degradation warnings                                                  | BDD scenario  |
| C12 | `PlatformAdapter` declares `supportedRange` as a semver range string                              | Standard compatibility contract (matches VS Code engines, npm peerDependencies) | BDD assertion |

### Normalization Constraints

| #   | Rule                                                                                                   | Rationale                                        | Verified by   |
| --- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------ | ------------- |
| C13 | A legacy package (SKILL.md only, no atoms in tank.json) normalizes to a single-instruction `PackageIR` | Zero migration required for existing skills      | BDD scenario  |
| C14 | A Tier 1 package (tank.json with `atoms` array) normalizes to a `PackageIR` with typed atoms           | Declarative authoring works without build step   | BDD scenario  |
| C15 | A Tier 2 package (tank.config.ts with `definePackage()`) normalizes to a `PackageIR`                   | Programmatic authoring with full TypeScript SDK  | BDD scenario  |
| C16 | Normalization rejects invalid atom shapes with structured Zod errors                                   | Authors get actionable feedback                  | BDD scenario  |
| C17 | Normalization preserves `extensions` bags without validation                                           | Extensions are adapter-owned, not core-validated | BDD assertion |

---

## Layer 3: Examples

### IR Schema Validation

| #   | Input                                                                                                                | Expected Output                                       |
| --- | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| E1  | `{ kind: 'instruction', content: './rules.md', scope: 'project' }`                                                   | Valid `InstructionIR`                                 |
| E2  | `{ kind: 'instruction' }` (missing `content`)                                                                        | Zod error: `content` is required                      |
| E3  | `{ kind: 'hook', event: 'pre-tool-use', handler: { type: 'dsl', actions: [{ action: 'block', match: 'rm -rf' }] } }` | Valid `HookIR` with DSL handler                       |
| E4  | `{ kind: 'hook', event: 'pre-tool-use', handler: { type: 'js', entry: './hooks/check.ts' } }`                        | Valid `HookIR` with JS handler                        |
| E5  | `{ kind: 'hook', event: 'pre-tool-use', handler: { type: 'invalid' } }`                                              | Zod error: discriminator `type` must be `dsl` or `js` |
| E6  | `{ kind: 'agent', name: 'reviewer', role: 'Code reviewer', tools: ['read', 'grep'] }`                                | Valid `AgentIR`                                       |
| E7  | `{ kind: 'tool', name: 'my-tool', mcp: { command: 'npx', args: ['-y', 'my-server'] } }`                              | Valid `ToolIR`                                        |
| E8  | `{ kind: 'rule', event: 'pre-tool-use', match: 'bash', policy: 'block' }`                                            | Valid `RuleIR`                                        |
| E9  | `{ kind: 'resource', uri: 'docs://api-reference', description: 'API docs' }`                                         | Valid `ResourceIR`                                    |
| E10 | `{ kind: 'prompt', name: 'deploy', description: 'Deploy to prod', template: './prompts/deploy.md' }`                 | Valid `PromptIR`                                      |
| E11 | `{ kind: 'instruction', content: './rules.md', extensions: { 'cursor': { alwaysApply: true } } }`                    | Valid — extensions preserved, core validated          |
| E12 | `{ kind: 'instruction', content: './rules.md', unknownField: true }`                                                 | Zod error: strict mode rejects unknown keys in core   |

### Adapter Capability Gating

| #   | Input                                                              | Expected Output                                         |
| --- | ------------------------------------------------------------------ | ------------------------------------------------------- |
| E13 | Hook atom + adapter with `hook: 'full'`                            | Adapter produces platform-specific hook files           |
| E14 | Hook atom + adapter with `hook: 'degraded'`                        | Adapter produces approximate output + warning metadata  |
| E15 | Hook atom + adapter with `hook: 'none'`                            | Adapter returns empty output + skip warning             |
| E16 | Adapter with `supportedRange: '>=2.4 <3'` + target version `2.5.0` | Compatibility check passes                              |
| E17 | Adapter with `supportedRange: '>=2.4 <3'` + target version `3.1.0` | Compatibility check fails with version mismatch warning |

### Tool Atom Runtimes & Extension Fallback (issue #453)

| #   | Input                                                                                                                                       | Expected Output                                                                          |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| E24 | `{ kind: 'tool', name: 'web-search', mcp: { runtime: 'uvx', package: 'web-search-mcp' } }` + opencode adapter                              | `.opencode/mcp/web-search.json` with `command: ["uvx","web-search-mcp"]`                 |
| E25 | `{ kind: 'tool', name: 'web-search', mcp: { runtime: 'npx', package: 'my-mcp', args: ['--flag'] } }` + claude-code adapter                  | `.mcp.json` with `command: 'npx'`, `args: ['-y','my-mcp','--flag']`                      |
| E26 | `{ kind: 'tool', name: 'memory', extensions: { opencode: { command: 'uvx', args: ['mem-mcp'], env: { KEY: 'x' } } } }` + opencode adapter | `.opencode/mcp/memory.json` built from `extensions.opencode`; NO skip warning            |
| E27 | `{ kind: 'tool', name: 'memory' }` (no `mcp`, no `extensions.<adapter>`) + any adapter                                                      | No files; one `skipped` warning per current behavior — preserves clear-failure semantics |

### Legacy Normalization

| #   | Input                                                             | Expected Output                                                       |
| --- | ----------------------------------------------------------------- | --------------------------------------------------------------------- |
| E18 | Directory with `SKILL.md` + `tank.json` (no `atoms` field)        | `PackageIR` with one instruction atom whose content is SKILL.md       |
| E19 | Directory with `SKILL.md` + `skills.json` (legacy filename)       | Same as E18 — legacy manifest works identically                       |
| E20 | Directory with `tank.json` containing `atoms` array               | `PackageIR` with typed atoms from the array                           |
| E21 | Directory with `tank.json` containing `atoms` with invalid shapes | Structured Zod errors listing each invalid atom                       |
| E22 | `tank.config.ts` exporting `definePackage({ atoms: [...] })`      | `PackageIR` with atoms from the config                                |
| E23 | `tank.config.ts` with `includes: ['@org/base-rules']`             | `PackageIR` with `includes` array preserved for downstream resolution |
