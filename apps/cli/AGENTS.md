# apps/cli — Tank CLI

## OVERVIEW

Node.js CLI (`tank` command) built with Commander.js. 13 commands for auth, publishing, installing, and auditing skills. Heavy consumer of `@tank/shared` for schemas, types, and semver resolution.

## STRUCTURE

```
src/
├── bin/tank.ts        # Entry point — registers all 13 commands
├── commands/          # One file per command (async function export)
│   ├── audit.ts       # Display security audit results
│   ├── info.ts        # Show skill metadata
│   ├── init.ts        # Create skills.json interactively
│   ├── install.ts     # Fetch, verify, extract skills (501 lines — largest)
│   ├── login.ts       # OAuth flow: start → browser → poll → store key
│   ├── logout.ts      # Clear auth token
│   ├── permissions.ts # Display resolved permissions + budget check
│   ├── publish.ts     # Pack → POST manifest → PUT tarball → confirm
│   ├── remove.ts      # Remove skill from project
│   ├── search.ts      # Search registry
│   ├── update.ts      # Update skills within semver ranges
│   ├── verify.ts      # Verify lockfile integrity
│   └── whoami.ts      # Display current user
├── lib/
│   ├── api-client.ts  # HTTP client (GET/POST/PUT) with Bearer auth
│   ├── config.ts      # ~/.tank/config.json read/write
│   ├── lockfile.ts    # skills.lock I/O + permission resolution
│   ├── packer.ts      # Tarball creation with security checks
│   ├── logger.ts      # User-facing chalk output (info/success/warn/error)
│   └── debug-logger.ts # Structured Pino → Loki debug logging
├── index.ts           # Public exports (VERSION, logger, config, ApiClient)
└── __tests__/         # Unit tests (mirrors commands/ and lib/)
```

## WHERE TO LOOK

| Task | File | Notes |
|------|------|-------|
| Add new command | `commands/<name>.ts` + `bin/tank.ts` | Export async fn, register with Commander |
| Modify API calls | `lib/api-client.ts` | Returns native `Response` objects |
| Change config | `lib/config.ts` | Default: `~/.tank/config.json`, `configDir` param for tests |
| Modify lockfile | `lib/lockfile.ts` | Also update `@tank/shared` schema if format changes |
| Change pack rules | `lib/packer.ts` | Security filters: no symlinks, no traversal, size limits |
| Add debug logging | `lib/debug-logger.ts` | Child loggers: `debugLog`, `httpLog`, `authFlowLog` |

## CONVENTIONS

- **Command pattern**: each command exports a single async function, registered in `bin/tank.ts` with try/catch + `process.exit(1)`
- **Error handling**: `bin/tank.ts` wraps each command action — catch extracts message, calls `flushLogs()`, exits
- **Config injection**: `configDir` parameter avoids touching real `~/.tank/` in tests
- **User output**: `logger` (chalk colors) for users; `debugLog`/`httpLog` (Pino) for structured debugging
- **Packer security**: rejects symlinks, path traversal (`..`), absolute paths. Max 1000 files, 50MB
- **Deterministic lockfile**: keys sorted alphabetically when writing `skills.lock`
- **Import style**: relative paths with `.js` extension (ESM requirement for Node)

## KEY FLOWS

**Install**: read `skills.json` → fetch versions from API → resolve semver → check permission budget → download tarball → verify SHA512 → extract safely → update `skills.json` + `skills.lock`

**Publish**: check auth → read `skills.json` → pack (validate + create tarball) → POST manifest → PUT tarball to signed URL → POST confirm

**Login**: POST `/api/v1/cli-auth/start` → open browser → user authorizes → poll `/api/v1/cli-auth/exchange` → store API key in config

## ANTI-PATTERNS

- **Never hardcode registry URL** — read from config (default from `@tank/shared` constants)
- **Never skip integrity verification** — SHA512 check is mandatory on install
- **Never extract without security filters** — `packer.ts` rejects symlinks and path traversal
- **Never use `logger` for debug data** — use `debugLog`/`httpLog` (Pino structured logging)
