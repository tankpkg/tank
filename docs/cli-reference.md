# CLI Reference

Current `tank` CLI surface, key flows, and repo-specific behavior.

## Commands

The CLI currently exposes 19 commands from `packages/cli/src/bin/tank.ts`.

- `login`
- `logout`
- `whoami`
- `init`
- `publish`
- `install`
- `remove`
- `update`
- `verify`
- `permissions`
- `search`
- `info`
- `audit`
- `scan`
- `link`
- `unlink`
- `doctor`
- `upgrade`
- `build`

## Key Flows

### Build

Compiles multi-atom skill packages into platform-native configuration files.

```bash
tank build <skill-dir> [options]
```

**Arguments:**

| Argument      | Required | Description                                        |
| ------------- | -------- | -------------------------------------------------- |
| `<skill-dir>` | yes      | Path to the skill directory containing `tank.json` |

**Options:**

| Flag               | Default     | Description                                                                           |
| ------------------ | ----------- | ------------------------------------------------------------------------------------- |
| `--platform <id>`  | auto-detect | Target platform: `opencode`, `claude-code`, `cursor`, `windsurf`, `cline`, `roo-code` |
| `--out <dir>`      | cwd         | Output directory for generated config files                                           |
| `--dry-run`        | false       | Preview files without writing                                                         |
| `--list-platforms` | false       | List available platforms and exit                                                     |

**Auto-detection:** If `--platform` is omitted, detects from target directory: `.opencode/` → opencode, `.cursor/` → cursor, `.claude/` → claude-code, `.windsurf/` or `.windsurfrules` → windsurf, `.clinerules` or `.cline/` → cline, `.roo/` or `.roomodes` → roo-code.

**Examples:**

```bash
# Build for OpenCode, output to current project
tank build ./skills/quality-gate --platform opencode

# Build with auto-detection (run from project root)
tank build ./skills/quality-gate

# Preview without writing
tank build ./skills/quality-gate --platform cursor --dry-run

# Build to specific output directory
tank build ./skills/quality-gate --platform claude-code --out /path/to/project
```

**Auto-build on install:** When `tank install` encounters a skill with `atoms` in its manifest, it automatically runs `tank build` for detected platforms in the target project.

### Install

1. resolve the requested range with `@internals/schemas`
2. fetch metadata and tarball URL from the registry
3. verify SHA-512 integrity
4. enforce permission budget and optional audit threshold
5. extract safely into `.tank/skills/...` or `~/.tank/skills/...`
6. update `skills.lock`

### Publish

1. validate `skills.json`
2. require `SKILL.md`
3. pack with ignore filters and archive safety checks
4. create upload via signed storage URL
5. confirm publish through the API

### Login

1. start CLI auth
2. open browser
3. poll exchange endpoint
4. write token to `~/.tank/config.json`

## Locations

- local extracts: `<project>/.tank/skills/@scope/name`
- global extracts: `~/.tank/skills/@scope/name`
- local lockfile: `skills.lock`
- global lockfile: `~/.tank/skills.lock`

## Agent Linking

Supported agent dirs are discovered from `packages/cli/src/lib/agents.ts`.

- Claude Code
- OpenCode
- Cursor
- Codex
- OpenClaw
- Universal

Symlink name rule: `@scope/name` -> `scope--name`

## Conventions

- one file per command
- config/home isolation is required for tests
- lockfile writes are deterministic
- pack/install paths reject traversal, absolute paths, links, oversize archives
