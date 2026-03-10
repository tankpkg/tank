# @tankpkg/mcp-server

MCP (Model Context Protocol) server for Tank — manage AI agent skills directly from your editor. Full CLI parity: every `tank` command is available as an MCP tool.

## Features

### Authentication

- **login** — Authenticate with Tank via GitHub OAuth
- **logout** — Clear stored credentials
- **whoami** — Show current user info

### Project Setup

- **init-skill** — Create `skills.json` and `SKILL.md` scaffold

### Publishing & Discovery

- **publish-skill** — Publish a skill to the Tank registry (with dry-run support)
- **search-skills** — Search the Tank registry for skills
- **skill-info** — Get detailed information about a specific skill

### Installation & Management

- **install-skill** — Install a skill with SHA-512 verification
- **update-skill** — Update skills within semver range
- **remove-skill** — Remove a skill and clean up lockfile

### Security & Verification

- **scan-skill** — Scan any directory for security issues (skills.json not required)
- **verify-skills** — Verify lockfile integrity
- **audit-skill** — Show security scan results and verdict
- **skill-permissions** — Display per-skill permission summary

### Agent Integration

- **link-skill** — Symlink a skill into an agent workspace
- **unlink-skill** — Remove a skill symlink

### Diagnostics

- **doctor** — Check config, auth, registry connectivity, and Node.js version

## Installation

### Claude Code

Add to `.claude/settings.json` or your project's `.mcp.json`:

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

Add to `~/.cursor/mcp.json`:

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

### VS Code (Copilot)

Add to `.vscode/mcp.json`:

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

## Authentication

The MCP server shares authentication with the Tank CLI. If you've already run `tank login`, you're authenticated!

Alternatively, set the `TANK_TOKEN` environment variable:

```json
{
  "mcpServers": {
    "tank": {
      "command": "npx",
      "args": ["-y", "@tankpkg/mcp-server"],
      "env": {
        "TANK_TOKEN": "tank_your_token_here"
      }
    }
  }
}
```

## Usage Examples

Once configured, talk to your AI agent naturally:

```
"Initialize a new skill in this directory"
"Scan my skill for security issues"
"Publish my skill to Tank"
"Install @acme/code-review"
"Update all my skills"
"Search Tank for testing skills"
"Show permissions for my installed skills"
"Run tank doctor to check my setup"
"Audit @acme/code-review for security issues"
"Link this skill to my Claude workspace"
```

## Development

```bash
# Install dependencies
bun install

# Build
bun build

# Run tests
bun test

# Start the server (stdio mode)
bun start
```

## License

MIT
