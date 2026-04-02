# Tank SDK — Agentic Framework Demos

Each demo shows `createSkillTool()` working with a different AI framework.
The agent autonomously discovers, reads, and uses Tank skills — zero hand-holding.

## Setup

```bash
npm install
```

Requires a running Tank registry at `http://localhost:5555` with at least one published skill.

## Demos

| File | Framework | Loop | Run |
|------|-----------|------|-----|
| `demo-openai.mjs` | OpenAI | Manual agentic loop | `OPENAI_API_KEY=... node demo-openai.mjs` |
| `demo-vercel-ai.mjs` | Vercel AI SDK | Auto (`maxSteps`) | `OPENAI_API_KEY=... node demo-vercel-ai.mjs` |
| `demo-anthropic.mjs` | Anthropic Claude | Manual agentic loop | `ANTHROPIC_API_KEY=... node demo-anthropic.mjs` |
| `demo-mcp-server.mjs` | MCP Server | N/A (server) | `node demo-mcp-server.mjs` |

## MCP Server

The MCP demo exposes Tank skills as MCP tools. Connect from any MCP client:

```json
{
  "mcpServers": {
    "tank-skills": {
      "command": "node",
      "args": ["/path/to/demo-mcp-server.mjs"],
      "env": {
        "TANK_REGISTRY_URL": "http://localhost:5555",
        "TANK_SKILLS": "@tank/react,@tank/nextjs"
      }
    }
  }
}
```

## How It Works

1. `createSkillTool(client, '@org/skill')` fetches skill metadata + file list
2. Returns a `SkillTool` with `execute()`, `toOpenAI()`, `toMCP()`
3. Register with any framework — the model autonomously calls the tool
4. Tool provides filesystem-like access: `read_all`, `list`, `read`
