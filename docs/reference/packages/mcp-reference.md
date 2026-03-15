# MCP Server Reference

Current MCP server surface and the rules that keep it aligned with the CLI.

## Shape

`@tankpkg/mcp-server` exposes 17 tools from `packages/mcp-server/src/tools/` and communicates over stdio.

It shares auth with the CLI:

1. `TANK_TOKEN`
2. `~/.tank/config.json`
3. default registry config

## Tools

- `login`
- `logout`
- `whoami`
- `init-skill`
- `publish-skill`
- `search-skills`
- `skill-info`
- `install-skill`
- `update-skill`
- `remove-skill`
- `scan-skill`
- `verify-skills`
- `audit-skill`
- `skill-permissions`
- `link-skill`
- `unlink-skill`
- `doctor`

## Patterns

- one file per tool
- register from `src/index.ts`
- use shared schemas/constants via `@internals/schemas`
- use shared pure helpers via `@internals/helpers`
- return markdown-friendly text payloads
- represent failures as MCP error payloads, not process crashes

## Packer Behavior

- `pack()` requires `skills.json` and `SKILL.md`
- `packForScan()` only requires a directory and applies the same archive safety checks
