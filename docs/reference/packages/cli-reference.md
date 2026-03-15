# CLI Reference

Current `tank` CLI surface, key flows, and repo-specific behavior.

## Commands

The CLI currently exposes 18 commands from `packages/cli/src/bin/tank.ts`.

- `login`
- `logout`
- `whoami`
- `init`
- `publish`
- `install`
- `remove`
- `update`
- `verify`
- `permissions`
- `search`
- `info`
- `audit`
- `scan`
- `link`
- `unlink`
- `doctor`
- `upgrade`

## Key Flows

### Install

1. resolve the requested range with `@internals/helpers`
2. fetch metadata and tarball URL from the registry
3. verify SHA-512 integrity
4. enforce permission budget and optional audit threshold
5. extract safely into `.tank/skills/...` or `~/.tank/skills/...`
6. update `skills.lock`

### Publish

1. validate `skills.json`
2. require `SKILL.md`
3. pack with ignore filters and archive safety checks
4. create upload via signed storage URL
5. confirm publish through the API

### Login

1. start CLI auth
2. open browser
3. poll exchange endpoint
4. write token to `~/.tank/config.json`

## Locations

- local extracts: `<project>/.tank/skills/@scope/name`
- global extracts: `~/.tank/skills/@scope/name`
- local lockfile: `skills.lock`
- global lockfile: `~/.tank/skills.lock`

## Agent Linking

Supported agent dirs are discovered from `packages/cli/src/lib/agents.ts`.

- Claude Code
- OpenCode
- Cursor
- Codex
- OpenClaw
- Universal

Symlink name rule: `@scope/name` -> `scope--name`

## Conventions

- one file per command
- config/home isolation is required for tests
- lockfile writes are deterministic
- pack/install paths reject traversal, absolute paths, links, oversize archives
