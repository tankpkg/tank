# Tank Integration: Agent Symlink Bridge (npm Model)

## Context

### Original Request
Bridge the "last mile" gap: `tank install` extracts skills to `.tank/skills/` but no AI agent looks there. Need symlinks to each agent's skill directory. Follow the npm model: local install, global install (`-g`), and developer link (`tank link`).

### Interview Summary
**Key Discussions**:
- Users publish ONCE to Tank — no cross-publishing to ClawHub
- Tank is both storefront (tankpkg.dev) AND backend infrastructure
- OpenClaw is third-party — we don't control it
- `tank install` = local project install + auto-link to agents
- `tank install -g` = global install to `~/.tank/skills/` + auto-link to agents
- `tank link` = npm-link style dev workflow (symlink current skill dir to agents, no registry)
- `tank unlink` = reverse of `tank link`

**Research Findings**:
- All agents (Claude Code, OpenCode, Cursor, Codex, OpenClaw) use filesystem-based skill discovery
- Agent directories: `~/.claude/skills/`, `~/.config/opencode/skills/`, `~/.cursor/skills/`, `~/.openclaw/skills/`
- skills.sh, ClawHub both use symlinks as the bridge pattern
- OpenClaw supports `skills.load.extraDirs` config and file watcher with `followSymlinks: true`
- Tank's current SKILL.md has NO YAML frontmatter — agents require it (`---\nname:\ndescription:\n---`)
- User's oh-my-opencode setup: symlinks from `~/dev/stanley/repos/skills/{name}` → `~/.config/opencode/skills/{name}`

### Metis Review
**Identified Gaps** (addressed):
- **Global vs project-local collision**: Global installs go to `~/.tank/skills/`. Local installs go to `.tank/skills/`. Both create symlinks to agent dirs. Last-write-wins with warning for same skill name.
- **Scoped name mapping**: `@tank/google-sheets` → symlink name `tank--google-sheets` (scope prefix, double-dash separator). Unique, reversible, no collisions.
- **SKILL.md integrity**: Never modify extracted file. Generate an AGENT-READY SKILL.md (with frontmatter) in a separate `.tank/agent-skills/` (local) or `~/.tank/agent-skills/` (global) directory. Symlinks point there.
- **OpenClaw plugin deferred**: Filesystem symlink bridge IS the OpenClaw integration. Plugin is future work.
- **Symlink failures are warnings, not errors**: `tank install` succeeds even if all symlink creation fails.

### npm Model Mapping

| npm | Tank | Storage | Agent Symlinks |
|-----|------|---------|---------------|
| `npm install pkg` | `tank install @org/skill` | `.tank/skills/` (project-local) | YES — auto-link to detected agents |
| `npm install -g pkg` | `tank install -g @org/skill` | `~/.tank/skills/` (global) | YES — auto-link to detected agents |
| `npm link` (in pkg dir) | `tank link` (in skill dir) | None (uses CWD directly) | YES — symlink CWD to agents |
| `npm unlink` | `tank unlink` | None | Removes dev symlinks from agents |
| `npm remove pkg` | `tank remove @org/skill` | Removes from `.tank/skills/` | YES — auto-unlink from agents |
| `npm remove -g pkg` | `tank remove -g @org/skill` | Removes from `~/.tank/skills/` | YES — auto-unlink from agents |

---

## Work Objectives

### Core Objective
Add the npm-model install/link workflow to Tank CLI so that installed skills are automatically discoverable by AI agents. Local installs, global installs, and developer symlinks all create agent-facing symlinks.

### Concrete Deliverables
- `apps/cli/src/lib/agents.ts` — Agent registry (detection, paths, name mapping)
- `apps/cli/src/lib/linker.ts` — Symlink engine (create/remove/status, frontmatter gen)
- `apps/cli/src/lib/links.ts` — Links manifest I/O (`.tank/links.json`)
- `apps/cli/src/commands/link.ts` — `tank link` (npm-link-style dev command)
- `apps/cli/src/commands/unlink.ts` — `tank unlink` (reverse of tank link)
- `apps/cli/src/commands/doctor.ts` — `tank doctor` (diagnostics)
- Modified `apps/cli/src/commands/install.ts` — Always-on agent linking + `-g` flag
- Modified `apps/cli/src/commands/remove.ts` — Auto-unlink on remove + `-g` flag
- Modified `apps/cli/src/commands/update.ts` — Re-link after update + `-g` flag
- Modified `apps/web/app/(registry)/skills/[...name]/page.tsx` — Install button with copy-to-clipboard
- Tests for all new and modified code

### Definition of Done
- [ ] `tank install @org/skill` extracts locally AND creates agent symlinks
- [ ] `tank install -g @org/skill` extracts globally AND creates agent symlinks
- [ ] `tank link` (in skill dir) symlinks CWD to all detected agent directories
- [ ] `tank unlink` removes dev symlinks from agent directories
- [ ] `tank remove @org/skill` removes local install + agent symlinks
- [ ] `tank remove -g @org/skill` removes global install + agent symlinks
- [ ] `tank doctor` reports agent status, symlink health, frontmatter presence
- [ ] tankpkg.dev skill pages show install commands with copy-to-clipboard
- [ ] All existing tests continue passing (`pnpm test`)
- [ ] All new code has unit test coverage

### Must Have
- `-g` / `--global` flag on `install`, `remove`, `update`
- Agent auto-detection (check if directory exists)
- Symlink creation to: Claude Code, OpenCode, Cursor, OpenClaw, Universal (`.agents/`)
- `.tank/links.json` (local) and `~/.tank/links.json` (global) tracking files
- SKILL.md frontmatter wrapper generation for skills that lack it
- `tank link` for developer workflow (no registry involved)
- Graceful degradation (warnings, not errors) on symlink failures
- Idempotent operations (run twice = same result)
- Web "Install" button on skill detail page

### Must NOT Have (Guardrails)
- **No `skills.lock` schema changes** — symlink state goes in separate `links.json`
- **No modifications to extracted files** — frontmatter goes in generated `.tank/agent-skills/` or `~/.tank/agent-skills/` dir
- **No `@tank/shared` changes** — no `fs`/`os` imports in shared package; agent constants live in CLI only
- **No OpenClaw plugin build** — filesystem symlinks ARE the OpenClaw integration
- **No custom protocol handlers** — web button copies CLI command to clipboard
- **No more than 6 agent targets** — Claude Code, OpenCode, Cursor, Codex, OpenClaw, Universal (`.agents/`)
- **No agent-specific frontmatter metadata** — only `name` + `description`
- **No Windows-specific junction logic** — symlinks only, document Windows limitation
- **No changes to the publish flow** — frontmatter is a consumer-side (install/link) concern
- **No global `skills.json` or `skills.lock`** — global install tracks only in `~/.tank/links.json`, no project-level manifest for global

---

## Verification Strategy (MANDATORY)

### Test Decision
- **Infrastructure exists**: YES — vitest established, 445+ tests passing
- **User wants tests**: TDD
- **Framework**: vitest (configured in each package)

### TDD Workflow
Each TODO follows RED-GREEN-REFACTOR:
1. **RED**: Write failing test first
2. **GREEN**: Implement minimum code to pass
3. **REFACTOR**: Clean up while keeping green
4. Verify: `pnpm test --filter=tank` (CLI tests)
5. Verify: `pnpm test` (all tests still pass)

---

## Task Flow

```
1 (agent registry) ──┐
                      ├→ 3 (linker core) → 4 (frontmatter gen)
2 (links.json I/O) ──┘         │
                               ├→ 5 (tank link — dev) ──┐
                               ├→ 6 (tank unlink)       ├→ 10 (tank doctor)
                               ├→ 7 (wire install + -g) ─┤
                               ├→ 8 (wire remove + -g)   │
                               └→ 9 (wire update + -g) ──┘
                                                          └→ 11 (web button) → 12 (E2E validation)
```

## Parallelization

| Group | Tasks | Reason |
|-------|-------|--------|
| A | 1, 2 | Independent: agent registry + links.json I/O |
| B | 5, 6, 7, 8, 9 | After linker core (3, 4), these can largely be done in sequence but some parallel |

| Task | Depends On | Reason |
|------|------------|--------|
| 3 | 1, 2 | Linker uses agent registry + links.json |
| 4 | 3 | Frontmatter gen is called by linker |
| 5 | 3, 4 | Link command uses linker |
| 6 | 3 | Unlink command uses linker |
| 7 | 3, 4 | Install wiring uses linker + frontmatter |
| 8 | 3 | Remove wiring uses linker |
| 9 | 7 | Update wiring follows install pattern |
| 10 | 3 | Doctor uses linker for status checks |
| 11 | none | Web button is independent |
| 12 | 5-10 | E2E validates full flow |

---

## TODOs

### Sprint 1: Foundation — Linker Module

- [x] 1. Agent Registry: Define supported agents and their skill directory paths

  **What to do**:
  - Create `apps/cli/src/lib/agents.ts`
  - Define `AgentInfo` interface: `{ id: string, name: string, skillsDir: string }`
  - Define `SUPPORTED_AGENTS` constant array with all 6 agents:
    - `claude` → `~/.claude/skills/`
    - `opencode` → `~/.config/opencode/skills/`
    - `cursor` → `~/.cursor/skills/`
    - `codex` → `~/.codex/skills/`
    - `openclaw` → `~/.openclaw/skills/`
    - `universal` → `~/.agents/skills/`
  - Create `detectInstalledAgents(homedir?)` function: check if each agent's parent config dir exists (e.g., `~/.claude/` for Claude Code), return filtered list
  - Create `getAgentSkillDir(agentId, homedir?)` function for testability (inject homedir)
  - Create `getSymlinkName(skillName)` function: maps `@tank/google-sheets` → `tank--google-sheets`, `my-skill` → `my-skill`
  - Create `getGlobalSkillsDir(homedir?)` function: returns `~/.tank/skills/`
  - Create `getGlobalAgentSkillsDir(homedir?)` function: returns `~/.tank/agent-skills/`
  - Write tests covering: all agent paths resolve correctly, detection works when dirs exist/don't exist, scoped name mapping, edge cases (empty scope, nested scope)

  **Must NOT do**:
  - Do NOT import `os` in `@tank/shared` — this module is CLI-only
  - Do NOT hardcode `os.homedir()` — accept as parameter for testability
  - Do NOT detect more than the 6 specified agents

  **Parallelizable**: YES (with task 2)

  **References**:

  **Pattern References**:
  - `apps/cli/src/lib/config.ts` — Home directory resolution pattern (`os.homedir()`, `configDir` injection for tests)

  **Test References**:
  - `apps/cli/src/__tests__/config.test.ts` — Pattern for testing home-dir-dependent code with temp directories

  **External References**:
  - Claude Code skill loading: `~/.claude/skills/<name>/SKILL.md` — confirmed via research
  - OpenCode skill loading: `~/.config/opencode/skills/<name>/SKILL.md` — confirmed via user's live setup (`ls ~/.config/opencode/skills/`)
  - OpenClaw skill loading: `~/.openclaw/skills/<name>/SKILL.md` — confirmed via OpenClaw docs
  - Cursor skill loading: `~/.cursor/skills/<name>/SKILL.md` — confirmed via research
  - Universal convention: `~/.agents/skills/<name>/SKILL.md` — used by skills.sh (Vercel)

  **Acceptance Criteria**:
  - [ ] Test file: `apps/cli/src/__tests__/agents.test.ts`
  - [ ] Tests cover: path resolution for all 6 agents, global dir paths, agent detection (exists/not exists), scoped name mapping (`@org/name` → `org--name`), unscoped name passthrough
  - [ ] `pnpm test --filter=tank` → PASS (new + existing tests)

  **Commit**: YES
  - Message: `feat(cli): add agent registry with detection and name mapping`
  - Files: `apps/cli/src/lib/agents.ts`, `apps/cli/src/__tests__/agents.test.ts`
  - Pre-commit: `pnpm test --filter=tank`

---

- [x] 2. Links Manifest: `.tank/links.json` and `~/.tank/links.json` read/write module

  **What to do**:
  - Create `apps/cli/src/lib/links.ts`
  - Define `LinksManifest` interface:
    ```
    {
      version: 1,
      links: {
        [skillName: string]: {
          source: string,              // "local" | "global" | "dev" (tank link)
          sourceDir: string,           // absolute path to skill content
          installedAt: string,         // ISO timestamp
          agentLinks: {
            [agentId: string]: string  // agentId → absolute symlink path
          }
        }
      }
    }
    ```
  - Create `readLinks(linksDir)` function: reads `links.json` from given directory, returns `LinksManifest`
  - Create `writeLinks(linksDir, manifest)` function: writes with sorted keys + trailing newline
  - Create `readLocalLinks(projectDir)` function: reads `.tank/links.json`
  - Create `readGlobalLinks(homedir?)` function: reads `~/.tank/links.json`
  - Create `addLink(manifest, skillName, source, sourceDir, agentId, symlinkPath)` function
  - Create `removeLink(manifest, skillName, agentId?)` function
  - Create `getLinksForSkill(manifest, skillName)` function
  - Write tests covering: read empty/missing/existing file, write deterministic output, add/remove, local vs global paths

  **Must NOT do**:
  - Do NOT modify `skills.lock` schema — this is a SEPARATE tracking file
  - Do NOT add LinksManifest types to `@tank/shared` — CLI-only concern

  **Parallelizable**: YES (with task 1)

  **References**:

  **Pattern References**:
  - `apps/cli/src/lib/lockfile.ts` — File I/O pattern with sorted keys and trailing newline

  **Test References**:
  - `apps/cli/src/__tests__/lockfile.test.ts` — Test pattern for JSON file I/O with temp directories

  **Acceptance Criteria**:
  - [ ] Test file: `apps/cli/src/__tests__/links.test.ts`
  - [ ] Tests cover: read missing file → empty manifest, read existing, write deterministic, add/remove, source types (local/global/dev), local vs global paths
  - [ ] `pnpm test --filter=tank` → PASS

  **Commit**: YES
  - Message: `feat(cli): add links manifest module for tracking agent symlinks`
  - Files: `apps/cli/src/lib/links.ts`, `apps/cli/src/__tests__/links.test.ts`
  - Pre-commit: `pnpm test --filter=tank`

---

- [x] 3. Linker Core: Symlink creation, removal, and status checking

  **What to do**:
  - Create `apps/cli/src/lib/linker.ts`
  - Import from `./agents.js` and `./links.js`
  - Create `linkSkillToAgents(options)` function:
    - Parameters: `{ skillName, sourceDir, linksDir, source: "local"|"global"|"dev", homedir? }`
    - `sourceDir` is the directory to symlink FROM (extractDir for install, agentSkillDir for frontmatter-wrapped, or CWD for `tank link`)
    - For each detected agent:
      1. Resolve agent skills directory path
      2. Compute symlink name via `getSymlinkName(skillName)`
      3. Check if symlink already exists (`lstatSync`):
         - If exists and points to correct target → skip (log debug)
         - If exists and points to wrong target → warn and overwrite
         - If dangling symlink → remove and recreate
      4. Create parent directory if needed (`mkdirSync recursive`)
      5. Create symlink: `fs.symlinkSync(sourceDir, symlinkPath, 'dir')`
      6. Update links manifest in `linksDir`
    - Returns: `{ linked: string[], skipped: string[], failed: string[] }` (agent IDs)
  - Create `unlinkSkillFromAgents(options)` function:
    - Parameters: `{ skillName, linksDir, homedir? }`
    - Read links manifest to find all symlinks for this skill
    - For each tracked symlink:
      1. Check if it exists and is a symlink (`lstatSync`)
      2. Remove symlink (`unlinkSync`) — never delete real directories
      3. Remove from links manifest
    - Returns: `{ unlinked: string[], notFound: string[] }`
  - Create `getSkillLinkStatus(options)` function:
    - Parameters: `{ skillName, linksDir, homedir? }`
    - Returns per-agent status: `{ agentId, linked: boolean, symlinkPath, targetValid: boolean }`
  - Create `getAllLinkStatuses(options)` function for doctor command
  - All operations catch errors and return them as `failed` entries — NEVER throw

  **Must NOT do**:
  - Do NOT modify the extracted files in `.tank/skills/` or `~/.tank/skills/`
  - Do NOT delete real directories (only symlinks tracked in links.json)
  - Do NOT throw on individual agent failures — collect and report
  - Do NOT use `fs.statSync` for symlink detection — use `fs.lstatSync`

  **Parallelizable**: NO (depends on 1, 2)

  **References**:

  **Pattern References**:
  - `apps/cli/src/commands/install.ts:365-371` — `getExtractDir()` function — shows how `.tank/skills/@scope/name` is structured
  - `apps/cli/src/commands/remove.ts:91-97` — `getSkillDir()` function — same pattern

  **API/Type References**:
  - Node.js `fs.symlinkSync(target, path, 'dir')` — creates directory symlink
  - Node.js `fs.lstatSync(path)` — stats without following symlinks
  - Node.js `fs.readlinkSync(path)` — reads symlink target

  **WHY Each Reference Matters**:
  - `getExtractDir()` tells us the exact source path for symlinks (`.tank/skills/@scope/name/`)
  - `lstatSync` vs `statSync`: `statSync` follows symlinks, `lstatSync` returns symlink info itself — critical for detecting existing/dangling symlinks

  **Acceptance Criteria**:
  - [ ] Test file: `apps/cli/src/__tests__/linker.test.ts`
  - [ ] Tests cover:
    - Link creates symlink in each detected agent dir
    - Link skips if symlink already correct
    - Link warns + overwrites if symlink points to wrong target
    - Link handles dangling symlinks (remove + recreate)
    - Link creates parent directories if needed
    - Link gracefully fails on permission denied (returns in `failed` array, doesn't throw)
    - Unlink removes only tracked symlinks
    - Unlink skips missing symlinks (idempotent)
    - Unlink never deletes real directories
    - Status correctly reports linked/unlinked/broken per agent
  - [ ] `pnpm test --filter=tank` → PASS

  **Commit**: YES
  - Message: `feat(cli): add linker core with symlink create/remove/status`
  - Files: `apps/cli/src/lib/linker.ts`, `apps/cli/src/__tests__/linker.test.ts`
  - Pre-commit: `pnpm test --filter=tank`

---

- [x] 4. SKILL.md Frontmatter Wrapper Generation

  **What to do**:
  - Create `apps/cli/src/lib/frontmatter.ts`
  - Create `prepareAgentSkillDir(options)` function:
    - Parameters: `{ skillName, extractDir, agentSkillsBaseDir, description? }`
    - `agentSkillsBaseDir` is `.tank/agent-skills/` (local) or `~/.tank/agent-skills/` (global)
    - Flow:
      1. Compute symlink name: `getSymlinkName(skillName)` → e.g., `tank--google-sheets`
      2. Create `{agentSkillsBaseDir}/{symlinkName}/`
      3. Read `{extractDir}/SKILL.md`
      4. Check if it already has YAML frontmatter (`/^---\s*\n/`)
      5. If YES → copy content as-is to `{agentSkillsBaseDir}/{symlinkName}/SKILL.md`
      6. If NO → prepend frontmatter:
         ```
         ---
         name: {skillName without scope, e.g., "google-sheets"}
         description: |
           {description from skills.json or first heading of SKILL.md}
         ---

         {original SKILL.md content}
         ```
      7. Copy/symlink reference files from extractDir (any non-SKILL.md files the skill contains)
    - Returns: absolute path to the agent-ready skill directory (this is the symlink TARGET for agents)
  - This function is called by install (after extraction) and by `tank link` (for dev skills)
  - For `tank link` (dev workflow), the skill dir already exists at CWD — if SKILL.md has frontmatter, symlink directly to CWD (no wrapper needed). If not, generate wrapper.

  **Must NOT do**:
  - Do NOT modify files in `.tank/skills/` or `~/.tank/skills/` (integrity-verified zone)
  - Do NOT add complex YAML parsing — simple regex check + string prepend is sufficient
  - Do NOT add agent-specific metadata beyond `name` and `description`

  **Parallelizable**: NO (depends on 3)

  **References**:

  **Pattern References**:
  - `apps/cli/src/commands/install.ts:365-371` — `getExtractDir()` — where original SKILL.md lives
  - `test-skill/SKILL.md` — Example SKILL.md WITHOUT frontmatter (the problem case)
  - `~/.config/opencode/skills/angular-expert/SKILL.md` (user's machine) — Example WITH proper frontmatter

  **WHY Each Reference Matters**:
  - `test-skill/SKILL.md` is the case we're fixing — no frontmatter, agents can't discover it
  - The angular-expert SKILL.md shows the exact YAML frontmatter format agents expect

  **Acceptance Criteria**:
  - [ ] Test file: `apps/cli/src/__tests__/frontmatter.test.ts`
  - [ ] Tests cover:
    - SKILL.md without frontmatter → frontmatter prepended in generated dir
    - SKILL.md with existing frontmatter → content preserved as-is
    - Description extracted from skills.json or first heading
    - Agent skill dir created at correct path (local and global variants)
    - Original extract content unchanged (integrity preserved)
    - Reference files accessible from agent skill dir
  - [ ] `pnpm test --filter=tank` → PASS

  **Commit**: YES
  - Message: `feat(cli): add SKILL.md frontmatter wrapper generation`
  - Files: `apps/cli/src/lib/frontmatter.ts`, `apps/cli/src/__tests__/frontmatter.test.ts`
  - Pre-commit: `pnpm test --filter=tank`

---

### Sprint 2: CLI Commands — Developer Workflow

- [x] 5. `tank link` Command (npm-link-style for skill developers)

  **What to do**:
  - Create `apps/cli/src/commands/link.ts`
  - Export `linkCommand(options: LinkOptions)`:
    - `interface LinkOptions { directory?: string, homedir?: string }`
    - No `name` argument — works on the CURRENT DIRECTORY (like `npm link`)
  - Flow:
    1. Read `skills.json` from CWD to get skill name + description
    2. If no `skills.json` → error: "No skills.json found. This command must be run from a skill directory."
    3. Detect installed agents via `detectInstalledAgents()`
    4. If no agents detected → log info message, exit gracefully
    5. Check if SKILL.md exists in CWD
    6. If SKILL.md has frontmatter → symlink target = CWD directly
    7. If SKILL.md lacks frontmatter → call `prepareAgentSkillDir()` to generate wrapper; symlink target = generated dir
    8. Call `linkSkillToAgents({ skillName, sourceDir, linksDir: globalLinksDir, source: "dev" })`
    9. Print summary: "Linked {skillName} to {N} agents:\n  ✅ Claude Code\n  ✅ OpenCode\n  ..."
  - Register in `apps/cli/src/bin/tank.ts`:
    ```
    program.command('link')
      .description('Link current skill directory to AI agent directories (for development)')
      .action(...)
    ```
  - Dev links are tracked in GLOBAL `~/.tank/links.json` (not project-local) with `source: "dev"`

  **Must NOT do**:
  - Do NOT accept a skill name argument — always uses CWD (npm-link pattern)
  - Do NOT require the skill to be published or installed
  - Do NOT modify the skill directory contents

  **Parallelizable**: YES (with task 6, after tasks 3 and 4 complete)

  **References**:

  **Pattern References**:
  - `apps/cli/src/commands/install.ts:65-253` — Command function pattern: options interface, spinner, try/catch
  - `apps/cli/src/bin/tank.ts:85-102` — Command registration pattern
  - npm link docs: `npm link` in package dir creates global symlink, others can then `npm link <pkg>` to use it

  **Acceptance Criteria**:
  - [ ] Test file: `apps/cli/src/__tests__/link.test.ts`
  - [ ] Tests cover:
    - `tank link` in skill dir → symlinks CWD (or agent wrapper) to all detected agent dirs
    - Error if no skills.json in CWD
    - Error if no name in skills.json
    - Graceful message if no agents detected
    - SKILL.md with frontmatter → symlinks directly to CWD
    - SKILL.md without frontmatter → generates wrapper, symlinks to wrapper
    - Idempotent: running twice produces same result
    - Tracked in global `~/.tank/links.json` with `source: "dev"`
  - [ ] `pnpm test --filter=tank` → PASS

  **Commit**: YES
  - Message: `feat(cli): add tank link command (npm-link-style for skill developers)`
  - Files: `apps/cli/src/commands/link.ts`, `apps/cli/src/__tests__/link.test.ts`, `apps/cli/src/bin/tank.ts`
  - Pre-commit: `pnpm test --filter=tank`

---

- [x] 6. `tank unlink` Command

  **What to do**:
  - Create `apps/cli/src/commands/unlink.ts`
  - Export `unlinkCommand(options: UnlinkOptions)`:
    - `interface UnlinkOptions { directory?: string, homedir?: string }`
    - Like `tank link`, works on CWD — reads skill name from `skills.json`
  - Flow:
    1. Read `skills.json` from CWD to get skill name
    2. Call `unlinkSkillFromAgents({ skillName, linksDir: globalLinksDir })`
    3. Clean up generated agent-skills wrapper if it exists
    4. Print summary: "Unlinked {skillName} from {N} agents"
  - Register in `apps/cli/src/bin/tank.ts`

  **Must NOT do**:
  - Do NOT remove the skill directory — only remove symlinks from agent dirs
  - Do NOT delete real directories that Tank didn't create

  **Parallelizable**: YES (with task 5, after task 3 complete)

  **References**:

  **Pattern References**:
  - `apps/cli/src/commands/remove.ts` — Similar flow: read state, remove things, print success

  **Acceptance Criteria**:
  - [ ] Test file: `apps/cli/src/__tests__/unlink.test.ts`
  - [ ] Tests cover:
    - `tank unlink` removes dev symlinks from all agent dirs
    - Error if no skills.json in CWD
    - Graceful if skill was never linked
    - Cleans up agent-skills wrapper dir
    - Does NOT modify the skill directory itself
    - Idempotent: running twice is safe
  - [ ] `pnpm test --filter=tank` → PASS

  **Commit**: YES
  - Message: `feat(cli): add tank unlink command (reverse of tank link)`
  - Files: `apps/cli/src/commands/unlink.ts`, `apps/cli/src/__tests__/unlink.test.ts`, `apps/cli/src/bin/tank.ts`
  - Pre-commit: `pnpm test --filter=tank`

---

### Sprint 3: Wire Into Existing Commands

- [ ] 7. Add `-g` flag and agent linking to `install` command

  **What to do**:
  - Modify `apps/cli/src/commands/install.ts`
  - Add `global` option to `InstallOptions`, `LockfileInstallOptions`, `InstallAllOptions`
  - **Local install** (`tank install @org/skill` — existing + new linking):
    - Steps 1-11 unchanged (extract to `.tank/skills/`, update skills.json + skills.lock)
    - Add step 12: Agent linking
      a. Call `prepareAgentSkillDir({ skillName, extractDir, agentSkillsBaseDir: path.join(directory, '.tank', 'agent-skills') })`
      b. Call `linkSkillToAgents({ skillName, sourceDir: agentSkillDir, linksDir: path.join(directory, '.tank'), source: "local" })`
      c. Log linked agents (or warning if failures)
      d. Symlink failures do NOT fail the install
  - **Global install** (`tank install -g @org/skill` — NEW):
    - Steps 1-4: Same version resolution logic but NO `skills.json` read/write (global has no project manifest)
    - Step 5-8: Same fetch + integrity check
    - Step 9: Extract to `~/.tank/skills/@scope/name/` instead of `.tank/skills/`
    - Step 10: NO `skills.json` update (global installs don't use project manifests)
    - Step 11: Write to `~/.tank/skills.lock` (global lockfile) instead of project `skills.lock`
    - Step 12: Agent linking
      a. Call `prepareAgentSkillDir({ ..., agentSkillsBaseDir: '~/.tank/agent-skills/' })`
      b. Call `linkSkillToAgents({ ..., linksDir: '~/.tank/', source: "global" })`
  - Modify `installAll` and `installFromLockfile` to respect `-g` flag
  - Register `-g` flag in `bin/tank.ts`:
    ```
    program.command('install')
      ...
      .option('-g, --global', 'Install skill globally (available to all projects)')
      .action(async (name, versionRange, opts) => { ... })
    ```

  **Must NOT do**:
  - Do NOT change existing function signatures for `installCommand()` — add `global` to options
  - Do NOT make link failures fail the install — always warn, never error
  - Do NOT create global `skills.json` — global installs track via `~/.tank/skills.lock` + `~/.tank/links.json` only

  **Parallelizable**: NO (depends on 3, 4)

  **References**:

  **Pattern References**:
  - `apps/cli/src/commands/install.ts:65-253` — Full install flow to modify
  - `apps/cli/src/commands/install.ts:365-371` — `getExtractDir()` — needs global variant
  - `apps/cli/src/lib/config.ts` — `os.homedir()` resolution for `~/.tank/`

  **Test References**:
  - `apps/cli/src/__tests__/install.test.ts` — Existing tests — ALL must continue passing

  **Acceptance Criteria**:
  - [ ] ALL existing install tests continue passing (zero regressions)
  - [ ] New tests:
    - `tank install @org/skill` → extracts locally + creates agent symlinks
    - `tank install @org/skill` with no agents detected → installs successfully, logs info about no agents
    - `tank install @org/skill` with link failure → install succeeds with warning
    - `tank install -g @org/skill` → extracts to `~/.tank/skills/` + creates agent symlinks
    - `tank install -g @org/skill` → does NOT create/modify project `skills.json`
    - `tank install -g @org/skill` → writes to `~/.tank/skills.lock`
    - `tank install -g` (no name) → installs all from global lockfile
    - Agent symlink target is the agent-skills wrapper dir (not raw extract dir)
  - [ ] `pnpm test --filter=tank` → PASS

  **Commit**: YES
  - Message: `feat(cli): add -g flag and always-on agent linking to install`
  - Files: `apps/cli/src/commands/install.ts`, `apps/cli/src/__tests__/install.test.ts`, `apps/cli/src/bin/tank.ts`
  - Pre-commit: `pnpm test --filter=tank`

---

- [ ] 8. Add `-g` flag and auto-unlink to `remove` command

  **What to do**:
  - Modify `apps/cli/src/commands/remove.ts`
  - Add `global` option to `RemoveOptions`
  - **Local remove** (`tank remove @org/skill`):
    - Before step 8 (delete `.tank/skills/`), add:
      1. Call `unlinkSkillFromAgents({ skillName, linksDir: '.tank/' })`
      2. Remove `.tank/agent-skills/{symlinkName}/` directory
      3. Log unlinked agents
    - Then proceed with existing removal steps
  - **Global remove** (`tank remove -g @org/skill`):
    - Call `unlinkSkillFromAgents({ skillName, linksDir: '~/.tank/' })`
    - Remove `~/.tank/agent-skills/{symlinkName}/` directory
    - Remove `~/.tank/skills/@scope/name/` directory
    - Update `~/.tank/skills.lock` (remove entry)
    - Do NOT touch project `skills.json` or project `skills.lock`
  - Register `-g` flag in `bin/tank.ts`

  **Must NOT do**:
  - Do NOT make unlink failures fail the remove — warn and continue
  - Do NOT change existing function signature — add `global` to options

  **Parallelizable**: NO (depends on 3)

  **References**:

  **Pattern References**:
  - `apps/cli/src/commands/remove.ts` — Current remove flow to modify

  **Test References**:
  - `apps/cli/src/__tests__/remove.test.ts` — Existing tests — ALL must continue passing

  **Acceptance Criteria**:
  - [ ] ALL existing remove tests continue passing
  - [ ] New tests:
    - `tank remove @org/skill` → removes local install + agent symlinks
    - `tank remove @org/skill` that was never linked → removes normally (no errors)
    - `tank remove -g @org/skill` → removes global install + agent symlinks
    - `tank remove -g @org/skill` → does NOT touch project files
    - Broken/missing symlinks → graceful handling
  - [ ] `pnpm test --filter=tank` → PASS

  **Commit**: YES
  - Message: `feat(cli): add -g flag and auto-unlink to remove command`
  - Files: `apps/cli/src/commands/remove.ts`, `apps/cli/src/__tests__/remove.test.ts`, `apps/cli/src/bin/tank.ts`
  - Pre-commit: `pnpm test --filter=tank`

---

- [ ] 9. Add `-g` flag and re-link to `update` command

  **What to do**:
  - Modify `apps/cli/src/commands/update.ts`
  - Add `global` option to `UpdateOptions`
  - After `installCommand()` succeeds for each skill:
    1. Regenerate agent skill dir (SKILL.md content may have changed)
    2. Symlinks still point to same agent-skills wrapper dir — but content is refreshed
    3. Log: "Updated and re-linked {name}"
  - For `-g`: update reads from `~/.tank/skills.lock`, extracts to `~/.tank/skills/`, re-links globally
  - Register `-g` flag in `bin/tank.ts`

  **Must NOT do**:
  - Do NOT change existing function signatures — add `global` to options

  **Parallelizable**: NO (depends on 7)

  **References**:

  **Pattern References**:
  - `apps/cli/src/commands/update.ts` — Current update flow (calls `installCommand` internally)

  **Acceptance Criteria**:
  - [ ] ALL existing update tests continue passing
  - [ ] New tests:
    - `tank update` → local update + agent skill dir regenerated
    - `tank update -g` → global update + agent skill dir regenerated
  - [ ] `pnpm test --filter=tank` → PASS

  **Commit**: YES
  - Message: `feat(cli): add -g flag and re-link to update command`
  - Files: `apps/cli/src/commands/update.ts`, `apps/cli/src/__tests__/update.test.ts`, `apps/cli/src/bin/tank.ts`
  - Pre-commit: `pnpm test --filter=tank`

---

### Sprint 4: Diagnostics + Web UI

- [ ] 10. `tank doctor` Command

  **What to do**:
  - Create `apps/cli/src/commands/doctor.ts`
  - Export `doctorCommand(options: DoctorOptions)`:
    - `interface DoctorOptions { directory?: string, homedir?: string }`
  - Performs checks:
    1. **Agent Detection**: List all supported agents, show which are installed
    2. **Local Skills**: List skills from project `skills.json`, check extraction dirs + symlink status
    3. **Global Skills**: List skills from `~/.tank/skills.lock`, check extraction dirs + symlink status
    4. **Dev Links**: List dev-linked skills from `~/.tank/links.json` where `source: "dev"`
    5. **Frontmatter Check**: For each linked skill, check if agent-ready SKILL.md has frontmatter
    6. **Suggestions**: Actionable commands to fix any issues found
  - Output format:
    ```
    Tank Doctor Report
    ==================

    Detected Agents:
      ✅ Claude Code    ~/.claude/skills/
      ✅ OpenCode       ~/.config/opencode/skills/
      ❌ Cursor         (not found)
      ✅ OpenClaw       ~/.openclaw/skills/

    Local Skills (2):                          [project: ~/my-project]
      @tank/typescript  1.0.0  ✅ linked (Claude, OpenCode, OpenClaw)
      @tank/react       1.0.0  ⚠️ broken link (Claude)

    Global Skills (1):                         [~/.tank/skills/]
      @tank/python      1.0.0  ✅ linked (Claude, OpenCode, OpenClaw)

    Dev Links (1):                             [tank link]
      my-custom-skill          ✅ linked (Claude, OpenCode, OpenClaw)

    Suggestions:
      • Run `tank install @tank/react` to fix broken link
    ```
  - Register in `apps/cli/src/bin/tank.ts`

  **Must NOT do**:
  - Do NOT check network connectivity — only filesystem status
  - Do NOT auto-fix issues — only diagnose and suggest commands

  **Parallelizable**: NO (depends on 3)

  **References**:

  **Pattern References**:
  - `apps/cli/src/commands/verify.ts` — Read-only diagnostic command pattern
  - `apps/cli/src/commands/permissions.ts` — Formatted table/summary output pattern
  - `apps/cli/src/lib/logger.ts` — Chalk-based output formatting

  **Acceptance Criteria**:
  - [ ] Test file: `apps/cli/src/__tests__/doctor.test.ts`
  - [ ] Tests cover:
    - Reports detected vs missing agents
    - Reports local, global, and dev-linked skills correctly
    - Reports linked/unlinked/broken symlinks
    - Provides actionable suggestions
    - Works with no skills installed (graceful empty state)
    - Works with no agents detected (graceful message)
  - [ ] `pnpm test --filter=tank` → PASS

  **Commit**: YES
  - Message: `feat(cli): add tank doctor command for integration diagnostics`
  - Files: `apps/cli/src/commands/doctor.ts`, `apps/cli/src/__tests__/doctor.test.ts`, `apps/cli/src/bin/tank.ts`
  - Pre-commit: `pnpm test --filter=tank`

---

- [ ] 11. Web "Install" Button on Skill Detail Page

  **What to do**:
  - Modify `apps/web/app/(registry)/skills/[...name]/page.tsx`
  - Add an "Install" section to the skill detail sidebar:
    - **Project** tab:
      ```
      tank install @org/skill-name
      ```
      With copy-to-clipboard button. Caption: "Installs to project and links to your AI agents"
    - **Global** tab:
      ```
      tank install -g @org/skill-name
      ```
      With copy-to-clipboard button. Caption: "Installs globally — available to all projects and agents"
  - Use shadcn Tabs component (or simple toggle)
  - Style consistently with existing skill detail page

  **Must NOT do**:
  - Do NOT add protocol handlers or deep links
  - Do NOT add authentication requirements for viewing install commands
  - Do NOT build OpenClaw plugin functionality

  **Parallelizable**: YES (independent of CLI tasks — can be done anytime)

  **References**:

  **Pattern References**:
  - `apps/web/app/(registry)/skills/[...name]/page.tsx` — Current skill detail page
  - `apps/web/components/ui/` — Existing shadcn UI components

  **External References**:
  - npm package page "Install" tab — the UX pattern we're following

  **Acceptance Criteria**:
  - [ ] Skill detail page shows install commands (Project + Global tabs)
  - [ ] Copy-to-clipboard works for both variants
  - [ ] Tab UI matches existing design language
  - [ ] Responsive on mobile
  - [ ] `pnpm build --filter=@tank/web` → succeeds
  - [ ] Manual: Visit skill page → see install buttons → copy works

  **Commit**: YES
  - Message: `feat(web): add install command tabs to skill detail page`
  - Files: `apps/web/app/(registry)/skills/[...name]/page.tsx` (and any new components)
  - Pre-commit: `pnpm build --filter=@tank/web`

---

### Sprint 5: Integration Validation

- [ ] 12. End-to-End Validation: Full npm-Model Flow

  **What to do**:
  - Manual E2E validation of all three workflows:

  **Workflow 1 — Local Install:**
  ```bash
  mkdir /tmp/test-project && cd /tmp/test-project
  tank install @tank/typescript
  # Verify: .tank/skills/@tank/typescript/ exists
  # Verify: .tank/agent-skills/tank--typescript/SKILL.md has frontmatter
  # Verify: symlinks in detected agent dirs (e.g., ~/.config/opencode/skills/tank--typescript)
  tank doctor
  # Verify: shows local skill as linked
  tank remove @tank/typescript
  # Verify: symlinks removed, .tank/skills/ cleaned, .tank/agent-skills/ cleaned
  ```

  **Workflow 2 — Global Install:**
  ```bash
  tank install -g @tank/react
  # Verify: ~/.tank/skills/@tank/react/ exists
  # Verify: ~/.tank/agent-skills/tank--react/SKILL.md has frontmatter
  # Verify: symlinks in agent dirs
  # Verify: ~/.tank/skills.lock contains entry
  tank doctor
  # Verify: shows global skill as linked
  tank remove -g @tank/react
  # Verify: symlinks removed, ~/.tank/skills/ cleaned
  ```

  **Workflow 3 — Dev Link:**
  ```bash
  cd /path/to/test-skill
  tank link
  # Verify: symlinks in agent dirs point to CWD (or wrapper)
  tank doctor
  # Verify: shows dev-linked skill
  tank unlink
  # Verify: symlinks removed, skill dir unchanged
  ```

  - Document results in `.sisyphus/evidence/`
  - Fix any issues found

  **Must NOT do**:
  - Do NOT automate as CI test (requires real agent dirs, real registry)
  - Do NOT modify agent configs during testing

  **Parallelizable**: NO (final validation)

  **Acceptance Criteria**:
  - [ ] All three workflows work correctly
  - [ ] `tank doctor` accurately reports all link types
  - [ ] No regressions: `pnpm test` → ALL tests pass
  - [ ] Web install button works on local dev server
  - [ ] Evidence documented

  **Commit**: YES
  - Message: `test: validate full npm-model agent integration flow`
  - Files: `.sisyphus/evidence/` documentation
  - Pre-commit: `pnpm test`

---

## Commit Strategy

| After Task | Message | Files | Verification |
|------------|---------|-------|--------------|
| 1 | `feat(cli): add agent registry with detection and name mapping` | `lib/agents.ts`, `__tests__/agents.test.ts` | `pnpm test --filter=tank` |
| 2 | `feat(cli): add links manifest module for tracking agent symlinks` | `lib/links.ts`, `__tests__/links.test.ts` | `pnpm test --filter=tank` |
| 3 | `feat(cli): add linker core with symlink create/remove/status` | `lib/linker.ts`, `__tests__/linker.test.ts` | `pnpm test --filter=tank` |
| 4 | `feat(cli): add SKILL.md frontmatter wrapper generation` | `lib/frontmatter.ts`, `__tests__/frontmatter.test.ts` | `pnpm test --filter=tank` |
| 5 | `feat(cli): add tank link command (npm-link for developers)` | `commands/link.ts`, `__tests__/link.test.ts`, `bin/tank.ts` | `pnpm test --filter=tank` |
| 6 | `feat(cli): add tank unlink command` | `commands/unlink.ts`, `__tests__/unlink.test.ts`, `bin/tank.ts` | `pnpm test --filter=tank` |
| 7 | `feat(cli): add -g flag and agent linking to install` | `commands/install.ts`, `__tests__/install.test.ts`, `bin/tank.ts` | `pnpm test --filter=tank` |
| 8 | `feat(cli): add -g flag and auto-unlink to remove` | `commands/remove.ts`, `__tests__/remove.test.ts`, `bin/tank.ts` | `pnpm test --filter=tank` |
| 9 | `feat(cli): add -g flag and re-link to update` | `commands/update.ts`, `__tests__/update.test.ts`, `bin/tank.ts` | `pnpm test --filter=tank` |
| 10 | `feat(cli): add tank doctor command` | `commands/doctor.ts`, `__tests__/doctor.test.ts`, `bin/tank.ts` | `pnpm test --filter=tank` |
| 11 | `feat(web): add install command tabs to skill detail page` | skill page + components | `pnpm build --filter=@tank/web` |
| 12 | `test: validate full npm-model agent integration flow` | evidence docs | `pnpm test` |

---

## Success Criteria

### Verification Commands
```bash
pnpm test                          # ALL tests pass (existing + new)
pnpm test --filter=tank            # CLI tests pass
pnpm build                         # Full build succeeds
tank install @tank/typescript      # Local install + agent linking
tank install -g @tank/react        # Global install + agent linking
tank link                          # Dev symlink (from skill dir)
tank doctor                        # Shows all link types
tank unlink                        # Removes dev links
tank remove @tank/typescript       # Local remove + unlink
tank remove -g @tank/react         # Global remove + unlink
```

### Final Checklist
- [ ] All "Must Have" features implemented
- [ ] All "Must NOT Have" guardrails respected
- [ ] All existing tests continue passing (zero regressions)
- [ ] New commands: `tank link`, `tank unlink`, `tank doctor`
- [ ] New flags: `-g` on `install`, `remove`, `update`
- [ ] Local installs: `.tank/skills/` + `.tank/agent-skills/` + `.tank/links.json`
- [ ] Global installs: `~/.tank/skills/` + `~/.tank/agent-skills/` + `~/.tank/links.json` + `~/.tank/skills.lock`
- [ ] Dev links: CWD → agent dirs, tracked in `~/.tank/links.json`
- [ ] Symlink failures are warnings, not errors
- [ ] Web install button visible on skill detail page
- [ ] E2E flow validated: all 3 workflows (local, global, dev)
