---
title: Publish Your First Skill
description: Step-by-step tutorial to publish your first AI agent skill to the Tank registry in under 10 minutes — with security scanning and permission declarations.
---

# Publish Your First Skill

This tutorial walks you through publishing your first AI agent skill to the Tank registry in under 10 minutes. By the end, your skill will be scanned, versioned, and available for others to install.

<div class="my-6 flex justify-center overflow-x-auto">
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 820 100" class="max-w-full" style="font-family: 'Space Grotesk', sans-serif;">
  <defs>
    <marker id="pub-arrow" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
      <path d="M0,0 L8,3 L0,6" fill="#64748b"/>
    </marker>
  </defs>
  <!-- Step 1 -->
  <rect x="15" y="22" width="115" height="55" rx="8" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="70" y="42" text-anchor="middle" fill="#64748b" font-weight="600" font-size="10">1</text>
  <text x="70" y="58" text-anchor="middle" fill="currentColor" font-weight="600" font-size="10">Install CLI</text>
  <text x="70" y="70" text-anchor="middle" fill="#64748b" font-size="9">npm i -g</text>
  <line x1="130" y1="50" x2="145" y2="50" stroke="#64748b" stroke-width="1.5" marker-end="url(#pub-arrow)"/>
  <!-- Step 2 -->
  <rect x="150" y="22" width="115" height="55" rx="8" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="207" y="42" text-anchor="middle" fill="#64748b" font-weight="600" font-size="10">2</text>
  <text x="207" y="58" text-anchor="middle" fill="currentColor" font-weight="600" font-size="10">Login</text>
  <text x="207" y="70" text-anchor="middle" fill="#64748b" font-size="9">tank login</text>
  <line x1="265" y1="50" x2="280" y2="50" stroke="#64748b" stroke-width="1.5" marker-end="url(#pub-arrow)"/>
  <!-- Step 3 -->
  <rect x="285" y="22" width="115" height="55" rx="8" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="342" y="42" text-anchor="middle" fill="#64748b" font-weight="600" font-size="10">3</text>
  <text x="342" y="58" text-anchor="middle" fill="currentColor" font-weight="600" font-size="10">Init</text>
  <text x="342" y="70" text-anchor="middle" fill="#64748b" font-size="9">tank init</text>
  <line x1="400" y1="50" x2="415" y2="50" stroke="#64748b" stroke-width="1.5" marker-end="url(#pub-arrow)"/>
  <!-- Step 4 -->
  <rect x="420" y="22" width="115" height="55" rx="8" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="477" y="42" text-anchor="middle" fill="#64748b" font-weight="600" font-size="10">4</text>
  <text x="477" y="58" text-anchor="middle" fill="currentColor" font-weight="600" font-size="10">SKILL.md</text>
  <text x="477" y="70" text-anchor="middle" fill="#64748b" font-size="9">write content</text>
  <line x1="535" y1="50" x2="550" y2="50" stroke="#64748b" stroke-width="1.5" marker-end="url(#pub-arrow)"/>
  <!-- Step 5 (green) -->
  <rect x="555" y="22" width="115" height="55" rx="8" fill="none" stroke="#10b981" stroke-width="1.5"/>
  <text x="612" y="42" text-anchor="middle" fill="#64748b" font-weight="600" font-size="10">5</text>
  <text x="612" y="58" text-anchor="middle" fill="#10b981" font-weight="600" font-size="10">Dry Run</text>
  <text x="612" y="70" text-anchor="middle" fill="#64748b" font-size="9">security scan</text>
  <line x1="670" y1="50" x2="685" y2="50" stroke="#64748b" stroke-width="1.5" marker-end="url(#pub-arrow)"/>
  <!-- Step 6 (green) -->
  <rect x="690" y="22" width="115" height="55" rx="8" fill="none" stroke="#16a34a" stroke-width="1.5"/>
  <text x="747" y="42" text-anchor="middle" fill="#64748b" font-weight="600" font-size="10">6</text>
  <text x="747" y="58" text-anchor="middle" fill="#16a34a" font-weight="600" font-size="10">Publish</text>
  <text x="747" y="70" text-anchor="middle" fill="#64748b" font-size="9">goes live</text>
</svg>
</div>

## Prerequisites

- Node.js 24+ installed
- A Tank account ([sign up free](/login))
- A skill directory you want to share

## Step 1: Install the Tank CLI

```bash
npm install -g @tankpkg/cli
```

Verify installation:

```bash
tank --version
```

## Step 2: Authenticate

```bash
tank login
```

This opens your browser for GitHub OAuth authentication. Once complete, your API key is stored securely in `~/.tank/config.json`.

## Step 3: Initialize Your Skill

Navigate to your skill directory and run:

```bash
tank init
```

This creates a `tank.json` manifest file:

```json
{
  "name": "@acme/my-skill",
  "version": "1.0.0",
  "description": "A brief description",
  "permissions": {
    "network": { "outbound": [] },
    "filesystem": { "read": [], "write": [] },
    "subprocess": false
  }
}
```

### Required Fields

| Field         | Description                            |
| ------------- | -------------------------------------- |
| `name`        | Scoped skill identifier (`@org/name`)  |
| `version`     | Semantic version (semver)              |
| `description` | Short description for registry listing |
| `permissions` | Explicit capability declarations       |

## Step 4: Declare Permissions

Tank enforces least-privilege by default. Declare only what your skill actually needs:

```json
{
  "name": "@acme/my-skill",
  "version": "1.0.0",
  "description": "Audits SEO for a given URL",
  "permissions": {
    "network": { "outbound": ["api.openai.com"] },
    "filesystem": {
      "read": ["./data/**"],
      "write": ["./output/**"]
    },
    "subprocess": false
  }
}
```

<Callout type="info">
  Skills with minimal, specific permissions are easier to review and less likely to fail project permission budgets
  during install.
</Callout>

See the [Permissions reference](/docs/permissions) for the full permission schema and best practices.

## Step 5: Run Security Scan

Before publishing, run Tank's 6-stage security scanner locally to catch issues early:

```bash
tank scan
```

This runs:

1. **Ingest** — Hashes files, validates tarball structure
2. **Structure validation** — Manifest integrity, file count and size limits
3. **Static analysis** — AST and regex scanning for dangerous patterns, plus Bandit for Python
4. **Injection detection** — Prompt injection and code injection patterns
5. **Secret scanning** — Credential and API key detection
6. **Supply chain** — Dependency vulnerability scanning (OSV API)

Fix any `CRITICAL` or `HIGH` findings before proceeding. The registry will reject skills that fail the mandatory security pipeline.

<Callout type="info">
  `tank scan` runs the local security check. `tank verify` checks lockfile integrity for installed skills — these are
  different commands with different purposes.
</Callout>

## Step 6: Publish

```bash
# Validate first (no upload)
tank publish --dry-run

# Publish for real
tank publish
```

Your skill is now:

- Scanned for security issues by the full 6-stage pipeline
- Assigned an audit score (0–10) based on quality and security
- Uploaded to the Tank registry tarball storage
- Available for others to install with `tank install @you/my-skill`

## Step 7: Verify Publication

Check your skill on the registry:

```bash
tank info my-skill
```

Or visit: `https://tankpkg.dev/skills/my-skill`

You'll see:

- The audit score and security scan results
- Version history and semver metadata
- Declared permissions
- Download and star counts

## Next Steps

- [Install a skill](/docs/installing) to see the consumer experience end-to-end
- [Read the CLI reference](/docs/cli) for all available commands and flags
- [Learn about the security model](/docs/security) to understand how the 6-stage pipeline works
- [Security checklist](/docs/security-checklist) to review your skill against best practices before publishing
- [CI/CD Integration](/docs/cicd) to automate publishing with the [GitHub Action](/docs/github-action)
