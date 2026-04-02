---
title: CLI Reference
description: Complete reference for all 20 Tank CLI commands — install, publish, search, audit, and manage AI agent skills with security-first design.
---

The Tank CLI provides 20 commands for publishing, installing, and managing AI agent skills with security-first design.

<div class="my-6 flex justify-center overflow-x-auto">
<svg viewBox="0 0 800 200" xmlns="http://www.w3.org/2000/svg" class="max-w-full" style="font-family: 'Space Grotesk', sans-serif;">
  <!-- Group 1: Publish Safely (green) -->
  <rect x="10" y="10" width="148" height="108" rx="10" fill="none" stroke="#16a34a" stroke-width="1.5"/>
  <text x="84" y="30" text-anchor="middle" fill="#16a34a" font-size="11" font-weight="600">Publish Safely</text>
  <text x="84" y="48" text-anchor="middle" fill="currentColor" font-size="10">init</text>
  <text x="84" y="62" text-anchor="middle" fill="currentColor" font-size="10">publish</text>
  <text x="84" y="76" text-anchor="middle" fill="currentColor" font-size="10">doctor</text>
  <rect x="20" y="88" width="128" height="22" rx="4" fill="#16a34a" fill-opacity="0.1"/>
  <text x="84" y="103" text-anchor="middle" fill="#16a34a" font-size="8" font-weight="600">validate before upload</text>
  <!-- Group 2: Install Securely (red) -->
  <rect x="170" y="10" width="148" height="108" rx="10" fill="none" stroke="#dc2626" stroke-width="1.5"/>
  <text x="244" y="30" text-anchor="middle" fill="#dc2626" font-size="11" font-weight="600">Install Securely</text>
  <text x="218" y="48" text-anchor="middle" fill="currentColor" font-size="10">install</text>
  <text x="270" y="48" text-anchor="middle" fill="currentColor" font-size="10">update</text>
  <text x="218" y="62" text-anchor="middle" fill="currentColor" font-size="10">remove</text>
  <text x="270" y="62" text-anchor="middle" fill="currentColor" font-size="10">verify</text>
  <rect x="180" y="74" width="128" height="36" rx="4" fill="#dc2626" fill-opacity="0.08"/>
  <text x="244" y="88" text-anchor="middle" fill="#dc2626" font-size="8" font-weight="600">SHA-512 lockfile</text>
  <text x="244" y="100" text-anchor="middle" fill="#dc2626" font-size="8" font-weight="600">+ permission budget</text>
  <!-- Group 3: Audit & Monitor (yellow) -->
  <rect x="330" y="10" width="148" height="108" rx="10" fill="none" stroke="#eab308" stroke-width="1.5"/>
  <text x="404" y="30" text-anchor="middle" fill="#eab308" font-size="11" font-weight="600">Audit &amp; Monitor</text>
  <text x="378" y="48" text-anchor="middle" fill="currentColor" font-size="10">audit</text>
  <text x="430" y="48" text-anchor="middle" fill="currentColor" font-size="10">scan</text>
  <text x="378" y="62" text-anchor="middle" fill="currentColor" font-size="10">permissions</text>
  <text x="430" y="62" text-anchor="middle" fill="currentColor" font-size="10">info</text>
  <rect x="340" y="74" width="128" height="36" rx="4" fill="#eab308" fill-opacity="0.08"/>
  <text x="404" y="88" text-anchor="middle" fill="#eab308" font-size="8" font-weight="600">6-stage security scan</text>
  <text x="404" y="100" text-anchor="middle" fill="#eab308" font-size="8" font-weight="600">see what skills can do</text>
  <!-- Group 4: Identity (neutral) -->
  <rect x="490" y="10" width="128" height="108" rx="10" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="554" y="30" text-anchor="middle" fill="currentColor" font-size="11" font-weight="600">Identity</text>
  <text x="554" y="48" text-anchor="middle" fill="currentColor" font-size="10">login</text>
  <text x="554" y="62" text-anchor="middle" fill="currentColor" font-size="10">logout</text>
  <text x="554" y="76" text-anchor="middle" fill="currentColor" font-size="10">whoami</text>
  <rect x="500" y="88" width="108" height="22" rx="4" fill="none" stroke="#64748b" stroke-width="0.5"/>
  <text x="554" y="103" text-anchor="middle" fill="#64748b" font-size="8">GitHub OAuth</text>
  <!-- Group 5: Dev Tools (dashed neutral) -->
  <rect x="630" y="10" width="160" height="108" rx="10" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="4,3"/>
  <text x="710" y="30" text-anchor="middle" fill="currentColor" font-size="11" font-weight="600">Dev Tools</text>
  <text x="680" y="48" text-anchor="middle" fill="#64748b" font-size="9">search</text>
  <text x="740" y="48" text-anchor="middle" fill="#64748b" font-size="9">link</text>
  <text x="680" y="62" text-anchor="middle" fill="#64748b" font-size="9">unlink</text>
  <text x="740" y="62" text-anchor="middle" fill="#64748b" font-size="9">run</text>
  <text x="680" y="76" text-anchor="middle" fill="#64748b" font-size="9">migrate</text>
  <text x="740" y="76" text-anchor="middle" fill="#64748b" font-size="9">upgrade</text>
  <rect x="640" y="88" width="140" height="22" rx="4" fill="none" stroke="#64748b" stroke-width="0.5" stroke-dasharray="3,2"/>
  <text x="710" y="103" text-anchor="middle" fill="#64748b" font-size="8">day-to-day workflow</text>
  <!-- Bottom: security emphasis -->
  <rect x="10" y="135" width="468" height="50" rx="8" fill="none" stroke="#10b981" stroke-width="1.5"/>
  <text x="244" y="155" text-anchor="middle" fill="#10b981" font-size="11" font-weight="600">Security runs through every phase — not a separate step</text>
  <text x="244" y="173" text-anchor="middle" fill="#64748b" font-size="9">publish validates → install checks hashes + permissions → audit scans post-install</text>
  <!-- Command count -->
  <rect x="500" y="135" width="290" height="50" rx="8" fill="none" stroke="#64748b" stroke-width="1" stroke-dasharray="4,3"/>
  <text x="645" y="155" text-anchor="middle" fill="currentColor" font-size="11" font-weight="600">20 commands · 7 aliases</text>
  <text x="645" y="173" text-anchor="middle" fill="#64748b" font-size="9">npm install -g @tankpkg/cli</text>
</svg>
</div>

## Installation

```bash
npm install -g @tankpkg/cli
```

## Global Options

All commands support these options:

| Option          | Description                  |
| --------------- | ---------------------------- |
| `-h, --help`    | Display help for the command |
| `-V, --version` | Display the CLI version      |

## tank init

Create a new tank.json in the current directory

```bash
tank init
```

### Options

| Flag                        | Description                    |
| --------------------------- | ------------------------------ |
| `-y, --yes`                 | Skip prompts, use defaults     |
| `--name <name>`             | Skill name                     |
| `--skill-version <version>` | Skill version (default: 0.1.0) |
| `--description <desc>`      | Skill description              |
| `--private`                 | Make skill private             |
| `--force`                   | Overwrite existing tank.json   |

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

| Flag                  | Description                         |
| --------------------- | ----------------------------------- | -------- |
| `--dry-run`           | Validate and pack without uploading |
| `--private`           | Publish skill as private            |
| `--visibility <mode>` | Skill visibility (public            | private) |

## tank install

Install a skill from the Tank registry, or all skills from lockfile

**Aliases:** `i`

```bash
tank install [name] [version-range]
```

### Arguments

| Name            | Description                                                        | Required |
| --------------- | ------------------------------------------------------------------ | -------- |
| `name`          | Skill name (e.g., @org/skill-name). Omit to install from lockfile. | No       |
| `version-range` | Semver range (default: \*)                                         | No       |

### Options

| Flag           | Description                                        |
| -------------- | -------------------------------------------------- |
| `-g, --global` | Install skill globally (available to all projects) |

## tank remove

Remove an installed skill

**Aliases:** `rm`, `r`

```bash
tank remove <name>
```

### Arguments

| Name   | Description                        | Required |
| ------ | ---------------------------------- | -------- |
| `name` | Skill name (e.g., @org/skill-name) | Yes      |

### Options

| Flag           | Description                       |
| -------------- | --------------------------------- |
| `-g, --global` | Remove a globally installed skill |

## tank update

Update skills to latest versions within their ranges

**Aliases:** `up`

```bash
tank update [name]
```

### Arguments

| Name   | Description                               | Required |
| ------ | ----------------------------------------- | -------- |
| `name` | Skill name to update (omit to update all) | No       |

### Options

| Flag           | Description                      |
| -------------- | -------------------------------- |
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

| Name    | Description  | Required |
| ------- | ------------ | -------- |
| `query` | Search query | Yes      |

## tank info

Show detailed information about a skill

**Aliases:** `show`

```bash
tank info <name>
```

### Arguments

| Name   | Description                        | Required |
| ------ | ---------------------------------- | -------- |
| `name` | Skill name (e.g., @org/skill-name) | Yes      |

## tank audit

Display security audit results for installed skills

```bash
tank audit [name]
```

### Arguments

| Name   | Description                             | Required |
| ------ | --------------------------------------- | -------- |
| `name` | Skill name to audit (omit to audit all) | No       |

## tank run

Launch an agent with credential protection (vault proxy)

```bash
tank run <agent>
```

### Arguments

| Name    | Description        | Required |
| ------- | ------------------ | -------- |
| `agent` | Agent ID to launch | Yes      |

### Options

| Flag        | Description                       |
| ----------- | --------------------------------- |
| `--verbose` | Print verbose vault proxy details |

## tank scan

Scan a local skill for security issues without publishing

```bash
tank scan
```

### Options

| Flag                     | Description                                    |
| ------------------------ | ---------------------------------------------- |
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

| Name      | Description                      | Required |
| --------- | -------------------------------- | -------- |
| `version` | Target version (default: latest) | No       |

### Options

| Flag        | Description                                     |
| ----------- | ----------------------------------------------- |
| `--dry-run` | Check for updates without installing            |
| `--force`   | Reinstall even if already on the target version |

## Quick Reference

| Command            | Alias(es) | Description                                                            |
| ------------------ | --------- | ---------------------------------------------------------------------- |
| `tank init`        | —         | Create a new tank.json in the current directory                        |
| `tank login`       | —         | Authenticate with the Tank registry via browser                        |
| `tank whoami`      | —         | Show the currently logged-in user                                      |
| `tank logout`      | —         | Remove authentication token from config                                |
| `tank publish`     | `pub`     | Pack and publish a skill to the Tank registry                          |
| `tank install`     | `i`       | Install a skill from the Tank registry, or all skills from lockfile    |
| `tank remove`      | `rm`, `r` | Remove an installed skill                                              |
| `tank update`      | `up`      | Update skills to latest versions within their ranges                   |
| `tank verify`      | —         | Verify installed skills match the lockfile                             |
| `tank permissions` | `perms`   | Display resolved permission summary for installed skills               |
| `tank search`      | `s`       | Search for skills in the Tank registry                                 |
| `tank info`        | `show`    | Show detailed information about a skill                                |
| `tank audit`       | —         | Display security audit results for installed skills                    |
| `tank run`         | —         | Launch an agent with credential protection (vault proxy)               |
| `tank scan`        | —         | Scan a local skill for security issues without publishing              |
| `tank link`        | `ln`      | Link current skill directory to AI agent directories (for development) |
| `tank unlink`      | —         | Remove skill symlinks from AI agent directories                        |
| `tank doctor`      | —         | Diagnose agent integration health                                      |
| `tank migrate`     | —         | Migrate skills.json → tank.json and skills.lock → tank.lock            |
| `tank upgrade`     | —         | Update tank to the latest version                                      |

---

## Environment Variables

| Variable       | Description                                                 |
| -------------- | ----------------------------------------------------------- |
| `TANK_TOKEN`   | API token — overrides `~/.tank/config.json` (used in CI/CD) |
| `TANK_DEBUG=1` | Enable debug logging (pino → Loki structured logs)          |
| `REGISTRY_URL` | Override the default registry URL                           |

## Configuration Files

| File                  | Purpose                                                                |
| --------------------- | ---------------------------------------------------------------------- |
| `~/.tank/config.json` | Auth token and registry URL (permissions: `0600`)                      |
| `tank.json`           | Project manifest — skill metadata, dependencies, and permission budget |
| `tank.lock`           | Deterministic lockfile — pinned versions with SHA-512 hashes           |

## Exit Codes

| Code | Meaning                                                                                   |
| ---- | ----------------------------------------------------------------------------------------- |
| `0`  | Success                                                                                   |
| `1`  | General error (invalid arguments, network failure, auth error)                            |
| `2`  | Security check failed (`tank verify`, `tank audit`, or `tank scan` with a `FAIL` verdict) |
