# MCP Server Reference

The `@tankpkg/mcp-server` package provides 17 MCP (Model Context Protocol) tools that give AI editors full CLI parity with the `tank` command. It shares auth with the CLI via `~/.tank/config.json` and communicates over stdio transport.

## Tools

| Tool | Description |
| --- | --- |
| `login` | GitHub OAuth device flow, save token |
| `logout` | Clear stored credentials |
| `whoami` | Display authenticated user info |
| `init-skill` | Create `skills.json` + `SKILL.md` scaffold |
| `publish-skill` | Pack, upload, confirm (supports dry-run) |
| `search-skills` | Query registry, markdown table output |
| `skill-info` | Fetch skill metadata + all versions |
| `install-skill` | Resolve version, fetch, SHA-512 verify, extract |
| `update-skill` | Update installed skill within semver range |
| `remove-skill` | Remove from skills.json + skills.lock + filesystem |
| `scan-skill` | Pack directory, upload for security scan, format results |
| `verify-skills` | Verify lockfile entries match installed dirs |
| `audit-skill` | Fetch security audit results + verdict |
| `skill-permissions` | Per-skill permission summary + budget check |
| `link-skill` | Symlink skill into agent workspace |
| `unlink-skill` | Remove agent workspace symlink |
| `doctor` | Diagnose: config, auth, registry, Node.js version |

## Tool Registration Pattern

Each tool lives in its own file under `src/tools/` and exports a single registration function. To add a new tool:

1. Create `src/tools/example.ts`
2. Export a `registerExampleTool` function
3. Call it from `src/index.ts`

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

## Configuration Precedence

1. `TANK_TOKEN` environment variable (highest priority)
2. `~/.tank/config.json` file
3. Defaults (registry: `https://tankpkg.dev`)

## packForScan vs pack

The packer module exposes two functions with different requirements:

- **`pack()`** -- requires `skills.json` + `SKILL.md` to be present. Used for publishing.
- **`packForScan()`** -- no requirements, synthesizes a manifest automatically. Used for scanning any directory without publish metadata.

Both enforce the same security filters: symlink rejection via `lstat()`, path traversal prevention, absolute path rejection, 1000-file limit, 50MB tarball limit.

## Markdown Output

Tools format results as markdown for editor readability:

- **Tables** for search results
- **Headers** for skill info
- **Code blocks** for permission summaries
- **Lists** for findings grouped by severity

All errors are returned as `{ isError: true }` rather than thrown -- tool handlers never throw exceptions.

## Editor Configuration

### Claude Code

In `.claude/settings.json` or `.mcp.json`:

```json
{
  "mcpServers": {
    "tank": {
      "command": "npx",
      "args": ["-y", "@tankpkg/mcp-server"]
    }
  }
}
```

### Cursor

In `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "tank": {
      "command": "npx",
      "args": ["-y", "@tankpkg/mcp-server"]
    }
  }
}
```

### VS Code

In `.vscode/mcp.json`:

```json
{
  "servers": {
    "tank": {
      "command": "npx",
      "args": ["-y", "@tankpkg/mcp-server"]
    }
  }
}
```
