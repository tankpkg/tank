---
title: Tank Documentation
description: Official documentation for Tank — the security-first package manager for AI agent skills. Install, publish, scan, and manage skills for Claude Code, Cursor, and other AI coding assistants.
---

# Tank Documentation

Tank is a **security-first package manager for AI agent skills** — the `npm` for the agent era, built after the ClawHavoc incident revealed that 341 malicious skills (12% of a major marketplace) were distributing credential-stealing malware. Where other registries have no versioning, no lockfiles, no permissions, and no security scanning, Tank enforces all four from day one.

Agent skills execute with the agent's full authority — reading files, making API calls, running shell commands. Tank treats that seriously.

<svg viewBox="0 0 800 380" xmlns="http://www.w3.org/2000/svg" class="max-w-full" style="font-family: 'Space Grotesk', sans-serif;">
  <!-- Without Tank (left) -->
  <rect x="15" y="10" width="370" height="345" rx="12" fill="none" stroke="#dc2626" stroke-width="1.5" stroke-dasharray="6,3"/>
  <text x="200" y="36" text-anchor="middle" fill="#dc2626" font-size="14" font-weight="600">Without Tank</text>
  <text x="200" y="70" text-anchor="middle" fill="currentColor" font-size="12">Agent installs skill from marketplace</text>
  <text x="200" y="100" text-anchor="middle" fill="#64748b" font-size="11">No scanning. No versioning. No lockfile.</text>
  <text x="200" y="118" text-anchor="middle" fill="#64748b" font-size="11">No declared permissions.</text>
  <!-- Attack examples -->
  <rect x="35" y="140" width="330" height="40" rx="6" fill="none" stroke="#dc2626" stroke-width="1"/>
  <text x="200" y="157" text-anchor="middle" fill="#dc2626" font-size="10" font-weight="600">CREDENTIAL THEFT</text>
  <text x="200" y="172" text-anchor="middle" fill="#64748b" font-size="10">Reads ~/.ssh/*, .env, API keys → exfiltrates</text>
  <rect x="35" y="190" width="330" height="40" rx="6" fill="none" stroke="#dc2626" stroke-width="1"/>
  <text x="200" y="207" text-anchor="middle" fill="#dc2626" font-size="10" font-weight="600">PROMPT INJECTION</text>
  <text x="200" y="222" text-anchor="middle" fill="#64748b" font-size="10">Hidden instructions hijack agent behavior</text>
  <rect x="35" y="240" width="330" height="40" rx="6" fill="none" stroke="#dc2626" stroke-width="1"/>
  <text x="200" y="257" text-anchor="middle" fill="#dc2626" font-size="10" font-weight="600">SUPPLY CHAIN ATTACK</text>
  <text x="200" y="272" text-anchor="middle" fill="#64748b" font-size="10">Typosquat packages install malware silently</text>
  <text x="200" y="336" text-anchor="middle" fill="#dc2626" font-size="11" font-weight="600">ClawHavoc: 341 malicious skills, 12% of marketplace</text>
  <!-- With Tank (right) -->
  <rect x="415" y="10" width="370" height="345" rx="12" fill="none" stroke="#10b981" stroke-width="2"/>
  <text x="600" y="36" text-anchor="middle" fill="#10b981" font-size="14" font-weight="600">With Tank</text>
  <!-- 4 guarantees -->
  <rect x="435" y="55" width="330" height="48" rx="6" fill="none" stroke="#10b981" stroke-width="1"/>
  <text x="600" y="73" text-anchor="middle" fill="#10b981" font-size="10" font-weight="600">6-STAGE SECURITY SCAN</text>
  <text x="600" y="93" text-anchor="middle" fill="#64748b" font-size="10">Injection, secrets, supply chain, static analysis</text>
  <rect x="435" y="113" width="330" height="48" rx="6" fill="none" stroke="#10b981" stroke-width="1"/>
  <text x="600" y="131" text-anchor="middle" fill="#10b981" font-size="10" font-weight="600">PERMISSION BUDGETS</text>
  <text x="600" y="151" text-anchor="middle" fill="#64748b" font-size="10">Declare needs. Set ceilings. Enforced at install.</text>
  <rect x="435" y="171" width="330" height="48" rx="6" fill="none" stroke="#10b981" stroke-width="1"/>
  <text x="600" y="189" text-anchor="middle" fill="#10b981" font-size="10" font-weight="600">SHA-512 INTEGRITY + LOCKFILE</text>
  <text x="600" y="209" text-anchor="middle" fill="#64748b" font-size="10">Hash-verified. Deterministic. Tamper = failure.</text>
  <rect x="435" y="229" width="330" height="48" rx="6" fill="none" stroke="#10b981" stroke-width="1"/>
  <text x="600" y="247" text-anchor="middle" fill="#10b981" font-size="10" font-weight="600">CREDENTIAL VAULT</text>
  <text x="600" y="267" text-anchor="middle" fill="#64748b" font-size="10">Tokenization proxy strips keys before LLM.</text>
  <text x="600" y="336" text-anchor="middle" fill="#10b981" font-size="11" font-weight="600">Every ClawHavoc attack class → blocked by design</text>
</svg>

## Deployment Options

| Option              | URL                                                | Best For                                    |
| ------------------- | -------------------------------------------------- | ------------------------------------------- |
| **Public Registry** | [www.tankpkg.dev](https://www.tankpkg.dev)         | Individual developers, open-source projects |
| **Nightly**         | [nightly.tankpkg.dev](https://nightly.tankpkg.dev) | Early access to upcoming features           |
| **Self-Hosted**     | Your own infrastructure                            | Enterprise, air-gapped, compliance          |

### CLI Channels

```bash
# Stable (default)
npm install -g @tankpkg/cli

# Nightly (latest from main)
npm install -g @tankpkg/cli@nightly
```

## Product Guarantees

Every skill installed through Tank is subject to:

| Guarantee                       | How It Works                                                                                        |
| ------------------------------- | --------------------------------------------------------------------------------------------------- |
| **SHA-512 integrity**           | Every tarball is verified against a cryptographic hash in `tank.lock` before extraction             |
| **Mandatory security scanning** | 6-stage pipeline (ingest → structure → static → injection → secrets → supply chain) runs on publish |
| **Permission declarations**     | Skills declare what they need in `tank.json`; installation fails if a skill exceeds your budget     |
| **Deterministic lockfile**      | `tank.lock` pins exact versions and hashes — same behavior as `npm ci`, reproducible everywhere     |

If any skill exceeds the permission budget, installation fails. This single feature would have prevented ClawHavoc.

## Choose Your Path

### I'm a Skill Publisher

You build skills that extend AI coding agents. You want to ship quickly without compromising on security posture.

1. **[Getting Started](/docs/getting-started)** — Install the CLI and authenticate
2. **[Publish Your First Skill](/docs/publish-first-skill)** — End-to-end tutorial in under 10 minutes
3. **[Publishing Reference](/docs/publishing)** — `tank.json` manifest, versioning, semver rules
4. **[Security Checklist](/docs/security-checklist)** — Pre-publish security review
5. **[GitHub Action](/docs/github-action)** — Automate publishing in CI with `tankpkg/tank@v1`

Quick start:

```bash
npm install -g @tankpkg/cli
tank login
tank init          # creates tank.json
tank publish --dry-run
tank publish
```

### I'm a Skill Consumer

You use AI coding agents (Claude Code, Cursor, etc.) and want to install community or org-internal skills safely.

1. **[Getting Started](/docs/getting-started)** — Install the CLI
2. **[Installing Skills](/docs/installing)** — `tank install`, lockfile workflow, permission review
3. **[Permissions](/docs/permissions)** — Understand the permission model before granting access
4. **[CI/CD Integration](/docs/cicd)** — Install skills in GitHub Actions, GitLab CI, Docker

Quick start:

```bash
npm install -g @tankpkg/cli
tank install @org/skill-name
tank permissions   # review what was granted
tank verify        # SHA-512 integrity check
```

### I'm in Ops / Security / Self-Hosting

You're deploying Tank for your organization, enforcing internal policies, or need air-gapped operation.

1. **[Self-Hosting](/docs/self-hosting)** — Full deployment runbook (Docker Compose + Kubernetes Helm)
2. **[Self-Host in 15 Minutes](/docs/self-host-quickstart)** — Quickstart with Docker Compose
3. **[Organizations](/docs/organizations)** — Namespacing, team access, and member management
4. **[Security Model](/docs/security)** — Deep dive on the 6-stage scanner, verdict rules, and audit scores
5. **[API Reference](/docs/api)** — REST endpoints for automation and integration

## All Documentation Pages

### Core Concepts

| Page                                     | Description                                                                 |
| ---------------------------------------- | --------------------------------------------------------------------------- |
| [Getting Started](/docs/getting-started) | Install the CLI, authenticate, and run your first command                   |
| [Publishing](/docs/publishing)           | `tank.json` manifest reference, versioning, and publish workflow            |
| [Installing](/docs/installing)           | Install skills, manage the lockfile, and review permissions                 |
| [Security Model](/docs/security)         | 6-stage scanning pipeline, verdict rules, and audit scores                  |
| [Permissions](/docs/permissions)         | Declare, review, and enforce skill permission boundaries                    |
| [Credential Vault](/docs/vault)          | Format-preserving tokenization proxy — real credentials never reach the LLM |

### Tutorials

| Page                                                  | Description                                                       |
| ----------------------------------------------------- | ----------------------------------------------------------------- |
| [Publish Your First Skill](/docs/publish-first-skill) | Step-by-step tutorial — from `tank init` to live registry listing |
| [Security Checklist](/docs/security-checklist)        | Pre-publish checklist covering permissions, code, and secrets     |
| [Self-Host in 15 Minutes](/docs/self-host-quickstart) | Docker Compose deployment in one session                          |

### SDKs & Integrations

| Page                                 | Description                                                          |
| ------------------------------------ | -------------------------------------------------------------------- |
| [TypeScript SDK](/docs/sdk)          | Programmatic registry access — search, download, and tool generation |
| [Python SDK](/docs/sdk-python)       | Python client for search, download, audit, and install               |
| [CI/CD Integration](/docs/cicd)      | GitHub Actions, GitLab CI, Docker pipeline examples                  |
| [GitHub Action](/docs/github-action) | Official `tankpkg/tank@v1` action — publish and install in CI        |
| [MCP Server](/docs/mcp)              | Use Tank tools directly inside AI editors via Model Context Protocol |
| [Search](/docs/search)               | Full-text skill discovery, filtering, and the search API             |
| [Organizations](/docs/organizations) | Create orgs, manage members, publish under `@org/` namespaces        |

### Reference

| Page                               | Description                                                   |
| ---------------------------------- | ------------------------------------------------------------- |
| [CLI Reference](/docs/cli)         | Every `tank` command with flags, examples, and exit codes     |
| [API Reference](/docs/api)         | REST API endpoints for the registry and admin operations      |
| [Self-Hosting](/docs/self-hosting) | Full production deployment guide with Docker Compose and Helm |
| [Releases](/docs/releases)         | Version history, changelog, and upgrade notes                 |

## Why Tank Exists

In February 2026, the **ClawHavoc incident** revealed a systemic failure: 341 malicious skills had been distributed through a major AI agent skill marketplace for weeks before detection. No versioning. No lockfiles. No permissions. No scanning. 12% of listed skills contained credential-stealing malware.

AI agent skills are fundamentally more dangerous than npm packages because they execute with the agent's full authority — reading your files, calling external APIs, running shell commands. Tank was built to apply the security discipline the ecosystem was missing from day one.

<Callout type="info">
  Tank is open source under the MIT License. The CLI is published as `@tankpkg/cli` on npm. Contribute at
  [github.com/tankpkg/tank](https://github.com/tankpkg/tank).
</Callout>
