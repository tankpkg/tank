# CLI — `tank` Command

## OVERVIEW

Commander.js CLI with 16 commands for publishing, installing, and managing AI agent skills with security-first design.

## STRUCTURE

```
cli/
├── bin/tank.ts                   # Entry point — registers all commands
├── src/
│   ├── commands/                 # 1-file-per-command (16 commands)
│   │   ├── install.ts            # Largest (613 lines) — fetch→verify→extract
│   │   ├── publish.ts            # Pack→POST→PUT→confirm
│   │   ├── agents.ts             # Agent linking management
│   │   └── ...                   # init, login, whoami, logout, remove, update,
│   │                             #   verify, permissions, search, info, audit,
│   │                             #   link, unlink, doctor
│   ├── lib/                      # Shared utilities
│   │   ├── api-client.ts         # HTTP client for registry API
│   │   ├── config.ts             # ~/.tank/config.json management
│   │   ├── lockfile.ts           # Deterministic lockfile (sorted keys)
│   │   ├── packer.ts             # Tarball creation with security filters
│   │   ├── linker.ts             # Agent linking infrastructure
│   │   ├── frontmatter.ts        # Skills.json frontmatter parsing
│   │   ├── links.ts              # Symlink management
│   │   ├── logger.ts             # chalk (user) + pino (debug)
│   │   └── debug-logger.ts       # TANK_DEBUG=1 → pino → Loki
│   └── __tests__/                # 25 test files, colocated
└── dist/                         # Build output (NodeNext)
```

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| Add new command | `src/commands/new-cmd.ts` | Export async fn, register in `bin/tank.ts` |
| Modify API calls | `src/lib/api-client.ts` | All registry HTTP communication |
| Modify tarball packing | `src/lib/packer.ts` | Security: rejects symlinks, path traversal, >50MB |
| Modify lockfile format | `src/lib/lockfile.ts` | LOCKFILE_VERSION from @tank/shared |
| Add agent linking logic | `src/lib/linker.ts` | Multi-agent skill installation |
| Add test | `src/__tests__/cmd-name.test.ts` | Pass `configDir` for isolation |

## KEY FLOWS

1. **Install**: resolve version → fetch tarball → verify SHA-512 → extract with security filters → update lockfile
2. **Publish**: validate skills.json → pack tarball → POST manifest → PUT tarball → POST confirm
3. **Login**: open browser → OAuth flow → poll for API key → store in `~/.tank/config.json`
4. **Agent linking**: parse frontmatter → resolve dependencies → symlink skills into agent workspace

## CONVENTIONS

- Commands export a single async function, registered in `bin/tank.ts`
- `configDir` injection for test isolation — never touch real `~/.tank/`
- `chalk` for user-facing output, `pino` for structured debug logs
- `.js` extensions on all imports (ESM with NodeNext resolution)
- Deterministic lockfile — sorted keys, stable output
- ALWAYS_IGNORED in packer: `.git`, `node_modules`, `.env*`, etc.

## ANTI-PATTERNS

- **Never hardcode registry URL** — use `REGISTRY_URL` from `@tank/shared`
- **Never skip SHA-512 verification** during install
- **Never extract without security filters** — reject symlinks, hardlinks, path traversal, absolute paths
- **Never use logger for debug output** — use `debug-logger` with `TANK_DEBUG=1`
- **Never exceed** 1000 files or 50MB per tarball (enforced in packer)
