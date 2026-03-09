# MCP SERVER — @tankpkg/mcp-server

## OVERVIEW

MCP (Model Context Protocol) server providing full CLI parity for AI editors (Claude Code, Cursor, VS Code Copilot). 17 tools expose all Tank commands as MCP tools. Shares auth with CLI via `~/.tank/config.json`.

## STRUCTURE

```
mcp-server/
├── src/
│   ├── index.ts                  # Entry point — registers all 17 tools, stdio transport
│   ├── tools/                    # 1-file-per-tool pattern (17 files)
│   │   ├── login.ts              # GitHub OAuth device flow
│   │   ├── logout.ts             # Clear credentials
│   │   ├── whoami.ts             # Display authenticated user
│   │   ├── init-skill.ts         # Create skills.json + SKILL.md scaffold
│   │   ├── publish-skill.ts      # Pack → POST → PUT → confirm (with dry-run)
│   │   ├── search-skills.ts      # Query registry, markdown table output
│   │   ├── skill-info.ts         # Fetch skill metadata + versions
│   │   ├── install-skill.ts      # Resolve → download → SHA-512 verify → extract
│   │   ├── update-skill.ts       # Update within semver range
│   │   ├── remove-skill.ts       # Remove from lockfile + filesystem
│   │   ├── scan-skill.ts         # Pack → upload → format findings
│   │   ├── verify-skills.ts      # Verify lockfile integrity
│   │   ├── audit-skill.ts        # Fetch security scan results
│   │   ├── skill-permissions.ts  # Permission summary + budget checking
│   │   ├── link-skill.ts         # Symlink into agent workspace
│   │   ├── unlink-skill.ts       # Remove agent symlink
│   │   └── doctor.ts             # Diagnose config, auth, registry, Node.js
│   └── lib/                      # Shared utilities (3 files)
│       ├── config.ts             # ~/.tank/config.json (TANK_TOKEN overrides file)
│       ├── api-client.ts         # HTTP client with Bearer auth
│       └── packer.ts             # Tarball creation with security validation
├── __tests__/                    # Unit tests (3 files)
│   ├── config.test.ts            # Config read/write, env var override, permissions
│   ├── api-client.test.ts        # Auth, fetch, error handling
│   └── packer.test.ts            # pack/packForScan, validation, symlink rejection
└── dist/                         # Build output (ESM + declarations)
```

## ALL 17 TOOLS

| Tool                | File                   | Purpose                                                    |
| ------------------- | ---------------------- | ---------------------------------------------------------- |
| `login`             | `login.ts`             | GitHub OAuth device flow → save token                      |
| `logout`            | `logout.ts`            | Clear stored credentials                                   |
| `whoami`            | `whoami.ts`            | Display authenticated user info                            |
| `init-skill`        | `init-skill.ts`        | Create `skills.json` + `SKILL.md` scaffold                 |
| `publish-skill`     | `publish-skill.ts`     | Pack → upload → confirm (supports dry-run)                 |
| `search-skills`     | `search-skills.ts`     | Query registry, markdown table output                      |
| `skill-info`        | `skill-info.ts`        | Fetch skill metadata + all versions                        |
| `install-skill`     | `install-skill.ts`     | Resolve version → fetch → SHA-512 verify → extract         |
| `update-skill`      | `update-skill.ts`      | Update installed skill within semver range                 |
| `remove-skill`      | `remove-skill.ts`      | Remove from skills.json + skills.lock + filesystem         |
| `scan-skill`        | `scan-skill.ts`        | Pack directory → upload for security scan → format results |
| `verify-skills`     | `verify-skills.ts`     | Verify lockfile entries match installed dirs               |
| `audit-skill`       | `audit-skill.ts`       | Fetch security audit results + verdict                     |
| `skill-permissions` | `skill-permissions.ts` | Per-skill permission summary + budget check                |
| `link-skill`        | `link-skill.ts`        | Symlink skill into agent workspace                         |
| `unlink-skill`      | `unlink-skill.ts`      | Remove agent workspace symlink                             |
| `doctor`            | `doctor.ts`            | Diagnose: config, auth, registry, Node.js ≥ v24            |

## WHERE TO LOOK

| Task             | Location                | Notes                                                    |
| ---------------- | ----------------------- | -------------------------------------------------------- |
| Add new tool     | `src/tools/new-tool.ts` | Export `registerNewTool(server)`, register in `index.ts` |
| Modify API calls | `src/lib/api-client.ts` | TankApiClient with Bearer auth                           |
| Modify config    | `src/lib/config.ts`     | `TANK_TOKEN` env var takes priority                      |
| Modify packing   | `src/lib/packer.ts`     | Security: rejects symlinks, path traversal, >50MB        |
| Add test         | `__tests__/new.test.ts` | Vitest, temp dirs for isolation                          |

## TOOL REGISTRATION PATTERN

```typescript
// src/tools/example.ts
export function registerExampleTool(server: McpServer): void {
  server.tool(
    "example", // Tool name
    "Description of what it does", // Description
    { param: z.string().describe("...") }, // Zod input schema
    async ({ param }) => {
      // ... implementation
      return { content: [{ type: "text", text: result }] };
    },
  );
}

// On error:
return { content: [{ type: "text", text: `Error: ${msg}` }], isError: true };
```

## KEY PATTERNS

### Configuration Precedence

1. `TANK_TOKEN` env var (highest priority)
2. `~/.tank/config.json` file
3. Defaults (registry: `https://tankpkg.dev`)

### Security (same as CLI)

- **SHA-512 verification** on all downloads
- **Symlink rejection** via `lstat()` check
- **Path traversal prevention** — reject `..` in paths
- **Absolute path rejection** — `path.isAbsolute()` check
- **Config file permissions** — `0o600` (owner read/write only)
- **Max limits** — 1000 files, 50MB tarball

### Markdown Output

Tools format results as markdown for editor readability: tables (search), headers (info), code blocks (permissions), lists (findings grouped by severity).

### packForScan vs pack

- **pack()** — requires `skills.json` + `SKILL.md` (for publishing)
- **packForScan()** — no requirements, synthesizes manifest (for scanning any directory)

## CONVENTIONS

> Universal conventions (strict TS, ESM, Zod safeParse, no cross-app imports) in root AGENTS.md.

- **Zod input validation** — all tool parameters validated
- **Markdown output** — results formatted for editor display
- **No exceptions from tools** — all errors caught, returned as `isError: true`

## ANTI-PATTERNS

> Universal anti-patterns (type suppression, cross-app imports, SHA-512, tarball limits) in root AGENTS.md.

- **Never throw from tool handlers** — return `isError: true` instead

## TESTING

```bash
bun test --filter=mcp-server            # All MCP server tests
bun test --filter=mcp-server -- config   # Config tests only
```

- Tests use temp directories for isolation
- Mock fetch for API calls
- 3 test files: config, api-client, packer

## EDITOR CONFIGURATION

```json
// Claude Code (.claude/settings.json or .mcp.json)
{ "mcpServers": { "tank": { "command": "npx", "args": ["-y", "@tankpkg/mcp-server"] } } }

// Cursor (~/.cursor/mcp.json)
{ "mcpServers": { "tank": { "command": "npx", "args": ["-y", "@tankpkg/mcp-server"] } } }

// VS Code (.vscode/mcp.json)
{ "servers": { "tank": { "command": "npx", "args": ["-y", "@tankpkg/mcp-server"] } } }
```
