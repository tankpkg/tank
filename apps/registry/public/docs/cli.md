---
title: CLI Reference
description: Complete reference for all 22 Tank CLI commands — install, publish, search, audit, and manage AI agent skills with security-first design.
---

The Tank CLI provides 22 commands for publishing, installing, and managing AI agent skills with security-first design.

## Installation

```bash
npm install -g @tankpkg/cli
```

## Global Options

All commands support these options:

| Option | Description |
|--------|-------------|
| `-h, --help` | Display help for the command |
| `-V, --version` | Display the CLI version |

## tank init

Create a new tank.json in the current directory

```bash
tank init
```

### Options

| Flag | Description |
|------|-------------|
| `-y, --yes` | Skip prompts, use defaults |
| `--name <name>` | Skill name |
| `--skill-version <version>` | Skill version (default: 0.1.0) |
| `--description <desc>` | Skill description |
| `--private` | Make skill private |
| `--force` | Overwrite existing tank.json |


## tank build <skill>



```bash
tank build <skill>
```

### Options

| Flag | Description |
|------|-------------|
| `-p, --platform <platform>` | Target platform (opencode, claude-code, cursor, windsurf, cline, roo-code) |
| `-o, --out <dir>` | Output directory (default: current directory) |
| `--dry-run` | Preview files without writing |
| `--list-platforms` | List available platforms and exit |


## tank login

Authenticate with the Tank registry via browser

```bash
tank login
```


## tank whoami

Show the currently logged-in user

```bash
tank whoami
```


## tank logout

Remove authentication token from config

```bash
tank logout
```


## tank publish

Pack and publish a skill to the Tank registry

**Aliases:** `pub`

```bash
tank publish
```

### Options

| Flag | Description |
|------|-------------|
| `--dry-run` | Validate and pack without uploading |
| `--private` | Publish skill as private |
| `--visibility <mode>` | Skill visibility (public|private) |


## tank install

Install a skill from the Tank registry, a URL, or all skills from lockfile

**Aliases:** `i`

```bash
tank install [name] [version-range]
```

### Arguments

| Name | Description | Required |
|------|-------------|----------|
| `name` | Skill name or URL (e.g., @org/skill-name or https://github.com/owner/repo). Omit to install from lockfile. | No |
| `version-range` | Semver range (default: *) | No |

### Options

| Flag | Description |
|------|-------------|
| `-g, --global` | Install skill globally (available to all projects) |
| `-y, --yes` | Auto-accept flagged scan verdicts |
| `--dangerously-no-tank-proxy` | Skip wrapping MCP servers with the tank proxy (no scanning, no enforcement) |


## tank remove

Remove an installed skill

**Aliases:** `rm`, `r`, `uninstall`

```bash
tank remove <name>
```

### Arguments

| Name | Description | Required |
|------|-------------|----------|
| `name` | Skill name (e.g., @org/skill-name) | Yes |

### Options

| Flag | Description |
|------|-------------|
| `-g, --global` | Remove a globally installed skill |


## tank update

Update skills to latest versions within their ranges

**Aliases:** `up`

```bash
tank update [name]
```

### Arguments

| Name | Description | Required |
|------|-------------|----------|
| `name` | Skill name to update (omit to update all) | No |

### Options

| Flag | Description |
|------|-------------|
| `-g, --global` | Update globally installed skills |


## tank verify

Verify installed skills match the lockfile

```bash
tank verify
```


## tank permissions

Display resolved permission summary for installed skills

**Aliases:** `perms`

```bash
tank permissions
```


## tank search

Search for skills in the Tank registry

**Aliases:** `s`

```bash
tank search <query>
```

### Arguments

| Name | Description | Required |
|------|-------------|----------|
| `query` | Search query | Yes |


## tank info

Show detailed information about a skill

**Aliases:** `show`

```bash
tank info <name>
```

### Arguments

| Name | Description | Required |
|------|-------------|----------|
| `name` | Skill name (e.g., @org/skill-name) | Yes |


## tank audit

Display security audit results for installed skills

```bash
tank audit [name]
```

### Arguments

| Name | Description | Required |
|------|-------------|----------|
| `name` | Skill name to audit (omit to audit all) | No |


## tank run

Launch an agent with credential protection (vault proxy)

```bash
tank run <agent>
```

### Arguments

| Name | Description | Required |
|------|-------------|----------|
| `agent` | Agent ID to launch | Yes |

### Options

| Flag | Description |
|------|-------------|
| `--verbose` | Print verbose vault proxy details |


## tank proxy

Transparent MCP proxy — wraps an MCP server with runtime enforcement

```bash
tank proxy [command]
```

### Arguments

| Name | Description | Required |
|------|-------------|----------|
| `command` | Child MCP server command to wrap (omit when using --reset-pins, --remote, or download-ml-model) | No |

### Options

| Flag | Description |
|------|-------------|
| `--audit-path <path>` | JSONL audit log path (default: ~/.tank/proxy/audit.jsonl) |
| `--reset-pins` | Delete all rug-pull schema pins under ~/.tank/proxy/pins/ and continue |
| `--remote <url>` | Connect to a remote MCP server over SSE/HTTP instead of spawning a child |
| `--requires-auth` | Require TANK_MCP_AUTH_<SLUG> env var before connecting to the remote |
| `--enable-ml` | Enable the opt-in ML-based prompt-injection classifier (requires ~500MB model; run `tank proxy download-ml-model` first) |
| `--verbose` | Print proxy diagnostic details to stderr |


## tank scan

Scan a local skill for security issues without publishing

```bash
tank scan
```

### Options

| Flag | Description |
|------|-------------|
| `-d, --directory <path>` | Directory to scan (default: current directory) |


## tank link

Link current skill directory to AI agent directories (for development)

**Aliases:** `ln`

```bash
tank link
```


## tank unlink

Remove skill symlinks from AI agent directories

```bash
tank unlink
```


## tank doctor

Diagnose agent integration health

```bash
tank doctor
```


## tank migrate

Migrate skills.json → tank.json and skills.lock → tank.lock

```bash
tank migrate
```


## tank upgrade

Update tank to the latest version

```bash
tank upgrade [version]
```

### Arguments

| Name | Description | Required |
|------|-------------|----------|
| `version` | Target version (default: latest) | No |

### Options

| Flag | Description |
|------|-------------|
| `--dry-run` | Check for updates without installing |
| `--force` | Reinstall even if already on the target version |


## Quick Reference

| Command | Alias(es) | Description |
|---------|-----------|-------------|
| `tank init` | — | Create a new tank.json in the current directory |
| `tank build <skill>` | — |  |
| `tank login` | — | Authenticate with the Tank registry via browser |
| `tank whoami` | — | Show the currently logged-in user |
| `tank logout` | — | Remove authentication token from config |
| `tank publish` | `pub` | Pack and publish a skill to the Tank registry |
| `tank install` | `i` | Install a skill from the Tank registry, a URL, or all skills from lockfile |
| `tank remove` | `rm`, `r`, `uninstall` | Remove an installed skill |
| `tank update` | `up` | Update skills to latest versions within their ranges |
| `tank verify` | — | Verify installed skills match the lockfile |
| `tank permissions` | `perms` | Display resolved permission summary for installed skills |
| `tank search` | `s` | Search for skills in the Tank registry |
| `tank info` | `show` | Show detailed information about a skill |
| `tank audit` | — | Display security audit results for installed skills |
| `tank run` | — | Launch an agent with credential protection (vault proxy) |
| `tank proxy` | — | Transparent MCP proxy — wraps an MCP server with runtime enforcement |
| `tank scan` | — | Scan a local skill for security issues without publishing |
| `tank link` | `ln` | Link current skill directory to AI agent directories (for development) |
| `tank unlink` | — | Remove skill symlinks from AI agent directories |
| `tank doctor` | — | Diagnose agent integration health |
| `tank migrate` | — | Migrate skills.json → tank.json and skills.lock → tank.lock |
| `tank upgrade` | — | Update tank to the latest version |

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `TANK_TOKEN` | API token — overrides `~/.tank/config.json` (used in CI/CD) |
| `TANK_DEBUG=1` | Enable debug logging (pino → Loki structured logs) |
| `REGISTRY_URL` | Override the default registry URL |

## Configuration Files

| File | Purpose |
|------|---------|
| `~/.tank/config.json` | Auth token and registry URL (permissions: `0600`) |
| `tank.json` | Project manifest — skill metadata, dependencies, and permission budget |
| `tank.lock` | Deterministic lockfile — pinned versions with SHA-512 hashes |

## Exit Codes

| Code | Meaning |
|------|---------|
| `0` | Success |
| `1` | General error (invalid arguments, network failure, auth error) |
| `2` | Security check failed (`tank verify`, `tank audit`, or `tank scan` with a `FAIL` verdict) |
