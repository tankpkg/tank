# CLI Reference

The `tank` CLI is a Commander.js application with 18 commands for publishing, installing, and managing AI agent skills. Entry point: `packages/cli/bin/tank.ts`.

## Commands

| Command | Description |
| --- | --- |
| `tank login` | Browser OAuth flow, stores API key in `~/.tank/config.json` |
| `tank logout` | Clear credentials from config |
| `tank whoami` | Display current user/org info |
| `tank init` | Create `skills.json` interactively |
| `tank publish` | Pack tarball, upload manifest, upload tarball, confirm |
| `tank install [skill]` | Resolve version, fetch tarball, SHA-512 verify, extract, update lockfile |
| `tank update [skill]` | Update installed skill within semver range |
| `tank remove [skill]` | Remove from lockfile and delete files |
| `tank scan [dir]` | Pack directory, upload for security scan, display findings |
| `tank search "query"` | Full-text search against registry |
| `tank info @org/skill` | Show skill metadata |
| `tank verify` | Verify lockfile integrity (SHA-512) |
| `tank permissions` | Display resolved permission summary and budget check |
| `tank audit [skill]` | Show security scan results |
| `tank link` | Symlink skill into agent workspaces (auto-detects agents) |
| `tank unlink` | Remove skill symlinks |
| `tank doctor` | Diagnose config, auth, agents, links |
| `tank upgrade [version]` | Self-upgrade via npm registry |

## Key Flows

### Install

1. Resolve version using semver range from `@tank/shared` resolver
2. Fetch tarball URL from registry
3. Download tarball to temp directory
4. Verify SHA-512 hash against registry signature
5. Extract with security filters (reject symlinks, hardlinks, path traversal, absolute paths, >50MB, >1000 files)
6. Write to `~/.tank/skills/@org/skill@version/`
7. Update `skills.lock` (deterministic, sorted keys)

### Publish

1. Validate `skills.json` against Zod schema
2. Pack tarball with `ALWAYS_IGNORED` filter (`.git`, `node_modules`, `.env*`, `.DS_Store`, `*.log`, `dist/`, `build/`)
3. POST manifest to `/v1/skills`
4. PUT tarball to signed URL
5. POST `/v1/skills/confirm` to finalize

### Login

1. POST `/v1/cli-auth/start` to get poll token + state
2. Open browser to GitHub OAuth
3. Poll `/v1/cli-auth/exchange` every 2s (5-min timeout)
4. Store API key (prefix `tank_`) in `~/.tank/config.json`

### Agent Linking

1. Detect installed agents (checks config dir existence)
2. Create symlinks: `~/{agent}/skills/org--skill` pointing to source
3. Update `~/.tank/links.json` with link entries
4. Track per-agent symlink status

## Supported Agents

| Agent | Config Dir | Skills Dir |
| --- | --- | --- |
| Claude | `~/.claude` | `{configDir}/skills` |
| Cursor | `~/.cursor` (Win: also `%APPDATA%\Cursor`) | `{configDir}/skills` |
| OpenCode | `~/.config/opencode` (Win: also `%APPDATA%\opencode`) | `{configDir}/skills` |
| Codex | `~/.codex` | `{configDir}/skills` |
| OpenClaw | `~/.openclaw` | `{configDir}/skills` |
| Universal | `~/.agents` | `{configDir}/skills` |

On Windows, agent detection checks both the Unix-style dotfile path and the `%APPDATA%` path. The first existing directory is used.

## Conventions

- **Deterministic lockfile** -- sorted keys, stable output, trailing newline
- **ALWAYS_IGNORED in packer** -- `.git`, `node_modules`, `.env*`, `.DS_Store`, `*.log`, `dist/`, `build/`
- **Config file permissions** -- directory `0700`, file `0600` (owner only)
- **Symlink naming** -- `@org/skill` becomes `org--skill` (double-dash separator)
- **Lockfile key parsing** -- use `lastIndexOf('@')` for scoped packages
- **1-file-per-command** -- export async fn, register in `bin/tank.ts`
- **configDir injection** -- for test isolation, never touch real `~/.tank/`
- **chalk for UI, pino for debug** -- enable debug logging with `TANK_DEBUG=1`
