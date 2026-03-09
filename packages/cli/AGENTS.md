# CLI — `tank` Command

## OVERVIEW

Commander.js CLI with 18 commands for publishing, installing, and managing AI agent skills with security-first design. Entry point: `bin/tank.ts` registers all commands from `src/commands/`.

## STRUCTURE

```
cli/
├── bin/tank.ts                   # Entry point — registers all 18 commands
├── src/
│   ├── commands/                 # 1-file-per-command (18 files)
│   │   ├── install.ts            # 677 lines — fetch→verify→extract, largest
│   │   ├── publish.ts            # Pack→POST→PUT→confirm
│   │   ├── update.ts             # 424 lines — semver resolution
│   │   ├── scan.ts               # Local skill scanning without publishing
│   │   ├── search.ts             # Query registry, display results
│   │   ├── init.ts               # Create skills.json interactively
│   │   ├── info.ts               # Show skill metadata
│   │   ├── whoami.ts             # Display current user
│   │   ├── verify.ts             # Verify lockfile integrity
│   │   ├── permissions.ts        # Display resolved permissions + budget check
│   │   ├── audit.ts              # Show security analysis
│   │   ├── remove.ts             # Remove skill from lockfile
│   │   ├── login.ts              # Browser OAuth → API key (state-based CSRF)
│   │   ├── logout.ts             # Clear ~/.tank/config.json
│   │   ├── link.ts               # Link skill to agent workspaces
│   │   ├── unlink.ts             # Remove skill symlinks
│   │   ├── doctor.ts             # Diagnose setup + linking issues
│   │   └── upgrade.ts            # Self-upgrade via npm registry
│   ├── lib/                      # Shared utilities (12 files)
│   │   ├── api-client.ts         # HTTP client for registry API
│   │   ├── config.ts             # ~/.tank/config.json management (0600 perms)
│   │   ├── lockfile.ts           # Deterministic lockfile (sorted keys)
│   │   ├── packer.ts             # 360 lines — tarball creation with security filters
│   │   ├── linker.ts             # 215 lines — agent detection + symlink management
│   │   ├── agents.ts             # 6 agent definitions (Claude, Cursor, OpenCode, Codex, OpenClaw, Universal)
│   │   ├── frontmatter.ts        # YAML frontmatter generation + markdown parsing
│   │   ├── links.ts              # links.json manifest management
│   │   ├── logger.ts             # chalk (user) + pino (debug)
│   │   ├── debug-logger.ts       # TANK_DEBUG=1 → pino → Loki
│   │   ├── upgrade-check.ts      # Background version checking
│   │   └── validator.ts          # Skills.json validation
│   ├── version.ts                # VERSION + USER_AGENT from package.json
│   └── __tests__/                # 28 test files, colocated with source
│       ├── install.test.ts       # 1658 lines — most comprehensive
│       ├── update.test.ts        # 534 lines
│       ├── publish.test.ts
│       └── ...                   # All commands have corresponding tests
└── dist/                         # Build output (NodeNext)
```

## ALL 18 COMMANDS

| Command                  | File             | Purpose                                                               |
| ------------------------ | ---------------- | --------------------------------------------------------------------- |
| `tank login`             | `login.ts`       | Browser OAuth → API key stored in `~/.tank/config.json`               |
| `tank logout`            | `logout.ts`      | Clear credentials from config                                         |
| `tank whoami`            | `whoami.ts`      | Display current user/org info                                         |
| `tank init`              | `init.ts`        | Create `skills.json` interactively                                    |
| `tank publish`           | `publish.ts`     | Pack tarball → POST manifest → PUT tarball → POST confirm             |
| `tank install [skill]`   | `install.ts`     | Resolve version → fetch tarball → SHA-512 verify → extract → lockfile |
| `tank update [skill]`    | `update.ts`      | Update within semver range                                            |
| `tank remove [skill]`    | `remove.ts`      | Remove from lockfile, delete files                                    |
| `tank scan [dir]`        | `scan.ts`        | Pack directory → upload for security scan → display findings          |
| `tank search "query"`    | `search.ts`      | FTS query registry                                                    |
| `tank info @org/skill`   | `info.ts`        | Show skill metadata                                                   |
| `tank verify`            | `verify.ts`      | Verify lockfile integrity (SHA-512)                                   |
| `tank permissions`       | `permissions.ts` | Display resolved permission summary + budget check                    |
| `tank audit [skill]`     | `audit.ts`       | Show security scan results                                            |
| `tank link`              | `link.ts`        | Symlink skill into agent workspaces (auto-detects agents)             |
| `tank unlink`            | `unlink.ts`      | Remove skill symlinks                                                 |
| `tank doctor`            | `doctor.ts`      | Diagnose config, auth, agents, links                                  |
| `tank upgrade [version]` | `upgrade.ts`     | Self-upgrade via npm registry                                         |

## WHERE TO LOOK

| Task                    | Location                         | Notes                                                          |
| ----------------------- | -------------------------------- | -------------------------------------------------------------- |
| Add new command         | `src/commands/new-cmd.ts`        | Export async fn, register in `bin/tank.ts`                     |
| Modify API calls        | `src/lib/api-client.ts`          | All registry HTTP communication                                |
| Modify tarball packing  | `src/lib/packer.ts`              | Security: rejects symlinks, path traversal, >50MB              |
| Modify lockfile format  | `src/lib/lockfile.ts`            | LOCKFILE_VERSION from @internal/shared                         |
| Add agent definition    | `src/lib/agents.ts`              | 6 agents: Claude, Cursor, OpenCode, Codex, OpenClaw, Universal |
| Add agent linking logic | `src/lib/linker.ts`              | Multi-agent skill installation                                 |
| Add test                | `src/__tests__/cmd-name.test.ts` | Pass `configDir` for isolation                                 |
| Modify validation       | `src/lib/validator.ts`           | skills.json schema validation                                  |
| Modify frontmatter      | `src/lib/frontmatter.ts`         | YAML generation + markdown parsing                             |

## KEY FLOWS

### Install Flow

1. Resolve version using semver range from `@internal/shared` resolver
2. Fetch tarball URL from registry
3. Download tarball to temp directory
4. **Verify SHA-512 hash** against registry signature
5. Extract with security filters:
   - Reject symlinks and hardlinks
   - Reject path traversal (`../`)
   - Reject absolute paths
   - Reject files >50MB total
   - Reject >1000 files
6. Write to `~/.tank/skills/@org/skill@version/`
7. Update `skills.lock` (deterministic, sorted keys)

### Publish Flow

1. Validate `skills.json` against Zod schema
2. Pack tarball with `ALWAYS_IGNORED` filter (`.git`, `node_modules`, `.env*`)
3. POST manifest to `/v1/skills`
4. PUT tarball to signed URL
5. POST `/v1/skills/confirm` to finalize

### Login Flow

1. POST `/v1/cli-auth/start` → get poll token + state
2. Open browser to GitHub OAuth
3. Poll `/v1/cli-auth/exchange` every 2s (5-min timeout)
4. Store API key (prefix `tank_`) in `~/.tank/config.json`

### Agent Linking Flow

1. Detect installed agents (checks config dir existence)
2. Create symlinks: `~/{agent}/skills/org--skill` → source
3. Update `~/.tank/links.json` with link entries
4. Track per-agent symlink status

### Supported Agents

| Agent     | Config Dir                                            | Skills Dir           |
| --------- | ----------------------------------------------------- | -------------------- |
| Claude    | `~/.claude`                                           | `{configDir}/skills` |
| Cursor    | `~/.cursor` (Win: also `%APPDATA%\Cursor`)            | `{configDir}/skills` |
| OpenCode  | `~/.config/opencode` (Win: also `%APPDATA%\opencode`) | `{configDir}/skills` |
| Codex     | `~/.codex`                                            | `{configDir}/skills` |
| OpenClaw  | `~/.openclaw`                                         | `{configDir}/skills` |
| Universal | `~/.agents`                                           | `{configDir}/skills` |

> On Windows, agent detection checks both the Unix-style dotfile path and the `%APPDATA%` path. The first existing directory is used.

## CONVENTIONS

> Universal conventions (strict TS, ESM, Zod safeParse, no cross-app imports) in root AGENTS.md.

- **Deterministic lockfile** — sorted keys, stable output, trailing newline
- **ALWAYS_IGNORED in packer**: `.git`, `node_modules`, `.env*`, `.DS_Store`, `*.log`, `dist/`, `build/`
- **Config file permissions**: dir `0700`, file `0600` (owner only)
- **Symlink naming**: `@org/skill` → `org--skill` (double-dash separator)
- **Lockfile key parsing**: use `lastIndexOf('@')` for scoped packages

## ANTI-PATTERNS

> Universal anti-patterns (type suppression, cross-app imports, SHA-512, tarball limits) in root AGENTS.md.

- **Never use logger for debug output** — use `debug-logger` with `TANK_DEBUG=1`
- **Never mutate config directly** — use `config.ts` utilities
- **Never use `stat()` for symlink detection** — use `lstat()` (stat follows symlinks)

## TESTING

```bash
# Run all CLI tests
bun test --filter=cli

# Run specific test
bun test --filter=cli -- install.test.ts

# With debug logging
TANK_DEBUG=1 bun test --filter=cli
```

- Tests use temp directories (`os.tmpdir()`) for filesystem isolation
- `configDir` passed to commands for config isolation
- Mock `fetch` via `vi.stubGlobal('fetch', mockFetch)`
- Mock `tar`, `ora`, `open` for side-effect isolation
- Each command has corresponding `__tests__/*.test.ts`
- Integration tests spawn real CLI binary (see `e2e/`)
