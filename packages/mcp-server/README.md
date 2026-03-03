# @tankpkg/mcp-server

MCP (Model Context Protocol) server for Tank - scan and publish AI agent skills directly from your editor.

## Features

- **scan-skill** - Scan a skill directory for security issues
- **publish-skill** - Publish a skill to the Tank registry (with dry-run support)
- **search-skills** - Search the Tank registry for skills
- **skill-info** - Get detailed information about a specific skill
- **login** - Authenticate with Tank via GitHub OAuth

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

### Scan a skill for security issues

```
"Scan my skill in the ./my-skill folder for security issues"
```

### Publish a skill

```
"Publish my-skill as a public package"
```

### Dry run before publishing

```
"Do a dry run publish of my skill to check if everything looks good"
```

### Search for skills

```
"Search Tank for code review skills"
```

### Get skill info

```
"Get info about @tank/code-review skill"
```

## Development

```bash
# Install dependencies
pnpm install

# Build
pnpm build

# Run tests
pnpm test

# Start the server (stdio mode)
pnpm start
```

## License

MIT
