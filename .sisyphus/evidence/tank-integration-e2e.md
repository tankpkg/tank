# Tank Integration E2E Validation Evidence

**Date**: 2026-02-15
**Plan**: tank-integration (12/12 tasks complete)
**Tester**: Atlas orchestrator (automated CLI validation)

---

## Test Environment

- **Machine**: macOS (darwin)
- **Node.js**: v24.11.0
- **Tank CLI**: v0.1.0 (globally linked from `apps/cli/dist/bin/tank.js`)
- **Registry**: tankpkg.dev (live, 18 published skills)
- **E2E project**: `/tmp/tank-e2e-test/` with permissive permissions

### Detected Agents (5/6)

| Agent | Status | Skills Directory |
|-------|--------|-----------------|
| Claude Code | Detected | `~/.claude/skills/` |
| OpenCode | Detected | `~/.config/opencode/skills/` |
| Cursor | Detected | `~/.cursor/skills/` |
| Codex | Detected | `~/.codex/skills/` |
| OpenClaw | Detected | `~/.openclaw/skills/` |
| Universal | Not found | `~/.agents/skills/` (dir doesn't exist) |

---

## Workflow 1: Local Install (PASSED)

### `tank install @tank/typescript`

```
$ cd /tmp/tank-e2e-test
$ tank install @tank/typescript
```

**Verified**:
- `.tank/skills/@tank/typescript/` — extracted with SKILL.md + reference files
- `.tank/agent-skills/tank--typescript/SKILL.md` — frontmatter wrapper generated
- `.tank/links.json` — tracks 5 agent symlinks with `source: "local"`
- Symlinks created in all 5 detected agent directories

### `tank doctor` (local skill)

```
Local Skills (1):
  @tank/typescript  1.0.0  linked (Claude Code, OpenCode, Cursor, Codex, OpenClaw)
```

### `tank remove @tank/typescript`

```
$ tank remove @tank/typescript
 Unlinked from 5 agent(s)
 Removed @tank/typescript
```

**Verified**:
- All 5 agent symlinks removed
- `.tank/agent-skills/tank--typescript/` removed
- `.tank/links.json` — empty links
- `.tank/skills/@tank/` — empty

---

## Workflow 2: Global Install (PASSED)

### `tank install -g @tank/react`

```
$ tank install -g @tank/react
```

**Verified**:
- `~/.tank/skills/@tank/react/` — extracted globally
- `~/.tank/agent-skills/tank--react/SKILL.md` — frontmatter wrapper
- `~/.tank/skills.lock` — contains `@tank/react@1.0.0` entry
- `~/.tank/links.json` — tracks 5 agent symlinks with `source: "global"`
- All 5 agent symlinks point to `~/.tank/agent-skills/tank--react`

### `tank doctor` (global skill)

```
Global Skills (1):
  @tank/react  1.0.0  linked (Claude Code, OpenCode, Cursor, Codex, OpenClaw)
```

### `tank remove -g @tank/react`

```
$ tank remove -g @tank/react
 Unlinked from 5 agent(s)
 Removed @tank/react (global)
```

**Verified**:
- All 5 agent symlinks removed
- `~/.tank/agent-skills/tank--react/` removed
- `~/.tank/skills/@tank/` — empty
- `~/.tank/skills.lock` — empty skills
- `~/.tank/links.json` — empty links

---

## Workflow 3: Dev Link (PASSED)

### `tank link` (from test-skill directory)

```
$ cd test-skill/
$ tank link
 Claude Code
 OpenCode
 Cursor
 Codex
 OpenClaw
 Linked @testorg/hello-world to 5 agent(s)
```

**Verified**:
- `~/.tank/links.json` — tracks with `source: "dev"`
- `~/.tank/agent-skills/testorg--hello-world/SKILL.md` — frontmatter wrapper generated (original lacked frontmatter)
- All reference files (index.js, skills.json, test/) copied to wrapper
- All 5 agent symlinks point to wrapper directory
- SKILL.md frontmatter: `name: hello-world`, `description: A test skill for E2E verification`

### `tank doctor` (dev link)

```
Dev Links (1):
  @testorg/hello-world  linked (Claude Code, OpenCode, Cursor, Codex, OpenClaw)
```

### `tank unlink`

```
$ cd test-skill/
$ tank unlink
 Unlinked @testorg/hello-world from 5 agent(s)
```

**Verified**:
- All 5 agent symlinks removed
- `~/.tank/agent-skills/testorg--hello-world/` removed
- `~/.tank/links.json` — empty links
- Original `test-skill/` directory **unchanged** (index.js, SKILL.md, skills.json, test/ intact)

---

## Unit Test Suite (PASSED)

```
$ pnpm test

 @tank/shared: 74 tests (4 files)  PASSED
 tank (CLI):  304 tests (25 files) PASSED
 @tank/web:   182 tests (13 files) PASSED
 TOTAL:       560 tests, 0 failures
```

---

## Summary

| Workflow | Commands Tested | Result |
|----------|----------------|--------|
| Local Install | `install`, `doctor`, `remove` | PASSED |
| Global Install | `install -g`, `doctor`, `remove -g` | PASSED |
| Dev Link | `link`, `doctor`, `unlink` | PASSED |
| Unit Tests | `pnpm test` (560 tests) | PASSED |

All 3 npm-model workflows validated end-to-end with real CLI, real registry, and real agent directories. Zero regressions.
