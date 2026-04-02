---
title: CI/CD Integration
description: Automate AI agent skill installation and publishing in CI/CD pipelines — GitHub Actions, GitLab CI, Docker, and the official Tank GitHub Action.
---

# CI/CD Integration

This guide covers automated skill installation and publishing in CI/CD pipelines — GitHub Actions, GitLab CI, or any environment where `tank install` or `tank publish` runs without a browser.

<div class="my-6 flex justify-center overflow-x-auto">
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 820 205" class="max-w-full" style="font-family: 'Space Grotesk', sans-serif;">
  <defs>
    <marker id="ci-arrow" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto"><path d="M0,0 L8,3 L0,6" fill="#64748b"/></marker>
  </defs>
  <rect x="15" y="12" width="58" height="18" rx="4" fill="#64748b" fill-opacity="0.15"/>
  <text x="44" y="25" text-anchor="middle" fill="#64748b" font-size="8" font-weight="600">LOCAL</text>
  <rect x="15" y="38" width="175" height="44" rx="8" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="102.5" y="56" text-anchor="middle" fill="currentColor" font-size="10" font-weight="600">tank login</text>
  <text x="102.5" y="70" text-anchor="middle" fill="#64748b" font-size="8">developer runs in terminal</text>
  <line x1="190" y1="60" x2="205" y2="60" stroke="#64748b" stroke-width="1.5" marker-end="url(#ci-arrow)"/>
  <rect x="210" y="38" width="175" height="44" rx="8" fill="none" stroke="#eab308" stroke-width="1.5"/>
  <text x="297.5" y="56" text-anchor="middle" fill="#eab308" font-size="10" font-weight="600">Browser OAuth</text>
  <text x="297.5" y="70" text-anchor="middle" fill="#64748b" font-size="8">GitHub auth in browser</text>
  <line x1="385" y1="60" x2="400" y2="60" stroke="#64748b" stroke-width="1.5" marker-end="url(#ci-arrow)"/>
  <rect x="405" y="38" width="175" height="44" rx="8" fill="none" stroke="#16a34a" stroke-width="1.5"/>
  <text x="492.5" y="56" text-anchor="middle" fill="#16a34a" font-size="10" font-weight="600">Token saved locally</text>
  <text x="492.5" y="70" text-anchor="middle" fill="#64748b" font-size="8">~/.tank/config.json</text>
  <line x1="580" y1="60" x2="595" y2="60" stroke="#64748b" stroke-width="1.5" marker-end="url(#ci-arrow)"/>
  <rect x="600" y="38" width="205" height="44" rx="8" fill="none" stroke="#10b981" stroke-width="1.5"/>
  <text x="702.5" y="56" text-anchor="middle" fill="#10b981" font-size="10" font-weight="600">tank install / tank publish</text>
  <text x="702.5" y="70" text-anchor="middle" fill="#64748b" font-size="8">CLI reads token automatically</text>
  <rect x="15" y="100" width="790" height="1" fill="#16a34a" fill-opacity="0.35"/>
  <text x="410" y="112" text-anchor="middle" fill="#16a34a" font-size="8" font-weight="600">Same commands, same security — only the auth method changes</text>
  <rect x="15" y="122" width="34" height="18" rx="4" fill="#10b981" fill-opacity="0.15"/>
  <text x="32" y="135" text-anchor="middle" fill="#10b981" font-size="8" font-weight="600">CI</text>
  <rect x="15" y="148" width="175" height="44" rx="8" fill="none" stroke="#10b981" stroke-width="1.5"/>
  <text x="102.5" y="166" text-anchor="middle" fill="#10b981" font-size="10" font-weight="600">TANK_TOKEN secret</text>
  <text x="102.5" y="180" text-anchor="middle" fill="#64748b" font-size="8">stored in CI settings</text>
  <line x1="190" y1="170" x2="205" y2="170" stroke="#64748b" stroke-width="1.5" marker-end="url(#ci-arrow)"/>
  <rect x="210" y="148" width="175" height="44" rx="8" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="4,3"/>
  <text x="297.5" y="166" text-anchor="middle" fill="currentColor" font-size="10" font-weight="600">No browser needed</text>
  <text x="297.5" y="180" text-anchor="middle" fill="#64748b" font-size="8">env var is auto-read</text>
  <line x1="385" y1="170" x2="400" y2="170" stroke="#64748b" stroke-width="1.5" marker-end="url(#ci-arrow)"/>
  <rect x="405" y="148" width="175" height="44" rx="8" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="492.5" y="166" text-anchor="middle" fill="currentColor" font-size="10" font-weight="600">Same CLI commands</text>
  <text x="492.5" y="180" text-anchor="middle" fill="#64748b" font-size="8">install, verify, publish</text>
  <line x1="580" y1="170" x2="595" y2="170" stroke="#64748b" stroke-width="1.5" marker-end="url(#ci-arrow)"/>
  <rect x="600" y="148" width="205" height="44" rx="8" fill="none" stroke="#10b981" stroke-width="1.5"/>
  <text x="702.5" y="166" text-anchor="middle" fill="#10b981" font-size="10" font-weight="600">Same security guarantees</text>
  <text x="702.5" y="180" text-anchor="middle" fill="#64748b" font-size="8">verify + audit + permission budget</text>
</svg>
</div>

## How It Works

1. Create an **API token** from your dashboard
2. Store it as `TANK_TOKEN` in your CI secrets
3. Commit `tank.json` and `tank.lock` to your repo
4. Run `tank install` in CI — it reads `TANK_TOKEN` automatically

The CLI checks `TANK_TOKEN` before reading `~/.tank/config.json`. No interactive login needed.

## Official GitHub Action

The fastest way to integrate Tank into GitHub Actions is the official `tankpkg/tank@v1` action. It handles CLI installation, authentication, and run execution in one step.

```yaml
- uses: tankpkg/tank@v1
  with:
    token: ${{ secrets.TANK_TOKEN }}
```

### Action Inputs

| Input       | Required | Default               | Description                                          |
| ----------- | -------- | --------------------- | ---------------------------------------------------- |
| `token`     | **Yes**  | —                     | Tank API token (`TANK_TOKEN`)                        |
| `registry`  | No       | `https://tankpkg.dev` | Registry URL (for self-hosted installs)              |
| `directory` | No       | `.`                   | Working directory containing `tank.json`             |
| `dry-run`   | No       | `false`               | Validate without publishing (publish workflows only) |

### Action Outputs

| Output        | Description                                   |
| ------------- | --------------------------------------------- |
| `name`        | Published skill name (e.g. `@org/skill-name`) |
| `version`     | Published semantic version                    |
| `audit-score` | Security audit score (0–10)                   |
| `badge-url`   | SVG badge URL for README embedding            |

See [GitHub Action reference](/docs/github-action) for the full input/output specification and advanced usage.

## Publish in CI with the GitHub Action

Use `tankpkg/tank@v1` in your release pipeline to publish automatically on tag push:

```yaml
name: Publish Skill

on:
  push:
    tags:
      - "v*"

jobs:
  publish:
    runs-on: ubuntu-latest
    permissions:
      contents: read

    steps:
      - uses: actions/checkout@v4

      - name: Publish to Tank registry
        id: tank
        uses: tankpkg/tank@v1
        with:
          token: ${{ secrets.TANK_TOKEN }}

      - name: Print audit score
        run: echo "Published ${{ steps.tank.outputs.name }}@${{ steps.tank.outputs.version }} — audit score ${{ steps.tank.outputs.audit-score }}/10"
```

<Callout type="info">
  The `tankpkg/tank@v1` action installs the CLI, authenticates with your token, and runs `tank publish` automatically.
  No manual `npm install -g @tankpkg/cli` step needed.
</Callout>

## 1) Create an API Token

Go to [Settings → Tokens](/tokens) and create a new token:

- **Name**: something descriptive (e.g. `github-actions-ci`)
- **Scopes**: `skills:read` is enough for installing skills
- **Expiry**: 90 days recommended, 365 max

Copy the token immediately — it's shown once.

Available scopes:

| Scope            | Grants                              |
| ---------------- | ----------------------------------- |
| `skills:read`    | Install, search, info, audit        |
| `skills:publish` | Publish new versions                |
| `skills:admin`   | Full access (implies `skills:read`) |

Use `skills:read` for CI consumers. Use `skills:publish` only for release pipelines that publish skills.

## 2) Store the Token

Add the token as a CI secret named `TANK_TOKEN`.

**GitHub Actions**: Settings → Secrets → Actions → New repository secret

**GitLab CI**: Settings → CI/CD → Variables → Add variable (masked)

**Generic**: Set `TANK_TOKEN` as an environment variable in your CI runner.

## 3) Commit Your Lockfile

Your repo should contain both files:

```
my-project/
├── tank.json       # Skill dependencies + permission budget
└── tank.lock       # Resolved versions + SHA-512 hashes
```

Generate the lockfile locally:

```bash
tank install
git add tank.json tank.lock
git commit -m "chore: add skill dependencies"
```

When `tank.lock` exists, `tank install` does a **deterministic lockfile install** — exact versions, SHA-512 verified, no resolution step. Same behavior as `npm ci`.

## 4) Pipeline Examples

### GitHub Actions (install only)

```yaml
name: Setup Agent Skills
on: [push]

jobs:
  install-skills:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: "24"

      - name: Install Tank CLI
        run: npm i -g @tankpkg/cli

      - name: Install skills
        env:
          TANK_TOKEN: ${{ secrets.TANK_TOKEN }}
        run: tank install

      - name: Verify integrity
        run: tank verify

      - name: Check permissions
        run: tank permissions
```

### GitHub Actions (publish using official action)

```yaml
name: Publish Skill on Release
on:
  release:
    types: [published]

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: tankpkg/tank@v1
        with:
          token: ${{ secrets.TANK_TOKEN }}
          dry-run: false
```

### GitLab CI

```yaml
install-skills:
  image: node:24
  variables:
    TANK_TOKEN: $TANK_TOKEN
  script:
    - npm i -g @tankpkg/cli
    - tank install
    - tank verify
    - tank permissions

publish-skill:
  image: node:24
  stage: release
  only:
    - tags
  variables:
    TANK_TOKEN: $TANK_TOKEN
  script:
    - npm i -g @tankpkg/cli
    - tank publish
```

### Docker

```dockerfile
FROM node:24-slim

RUN npm i -g @tankpkg/cli

WORKDIR /app
COPY tank.json tank.lock ./

ARG TANK_TOKEN
ENV TANK_TOKEN=$TANK_TOKEN

RUN tank install && tank verify

COPY . .
```

Build with:

```bash
docker build --build-arg TANK_TOKEN="$TANK_TOKEN" -t my-agent .
```

## 5) Verification Steps

Always run these after `tank install` in CI:

```bash
tank verify        # SHA-512 integrity check
tank permissions   # Print resolved permission summary
```

Optional security audit:

```bash
tank audit         # Show security scan results for all installed skills
```

If any command exits non-zero, the pipeline fails. This is intentional — do not suppress exit codes.

## 6) Install Location

Skills are installed to `.tank/skills/` relative to the working directory (local mode, default).

```
.tank/skills/@org/skill-name/
├── SKILL.md
├── tank.json
└── ...
```

For global installs (shared across projects), use `tank install -g`. Global skills go to `~/.tank/skills/`.

## Service Accounts (Teams & Enterprise)

<div class="my-6 flex justify-center overflow-x-auto">
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 750 90" class="max-w-full" style="font-family: 'Space Grotesk', sans-serif;">
  <defs>
    <marker id="sa-arrow" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto"><path d="M0,0 L8,3 L0,6" fill="#64748b"/></marker>
  </defs>
  <!-- Admin creates -->
  <rect x="15" y="20" width="130" height="50" rx="8" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="80" y="41" text-anchor="middle" fill="currentColor" font-size="9" font-weight="600">Admin creates</text>
  <text x="80" y="55" text-anchor="middle" fill="#64748b" font-size="8">service account</text>
  <line x1="145" y1="45" x2="165" y2="45" stroke="#64748b" stroke-width="1.5" marker-end="url(#sa-arrow)"/>
  <!-- API key -->
  <rect x="170" y="20" width="130" height="50" rx="8" fill="none" stroke="#10b981" stroke-width="1.5"/>
  <text x="235" y="41" text-anchor="middle" fill="#10b981" font-size="9" font-weight="600">API key</text>
  <text x="235" y="55" text-anchor="middle" fill="#64748b" font-size="8">skills:publish</text>
  <line x1="300" y1="45" x2="320" y2="45" stroke="#64748b" stroke-width="1.5" marker-end="url(#sa-arrow)"/>
  <!-- CI Secret -->
  <rect x="325" y="20" width="130" height="50" rx="8" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="390" y="41" text-anchor="middle" fill="currentColor" font-size="9" font-weight="600">CI secret</text>
  <text x="390" y="55" text-anchor="middle" fill="#64748b" font-size="8">TANK_TOKEN</text>
  <line x1="455" y1="45" x2="475" y2="45" stroke="#64748b" stroke-width="1.5" marker-end="url(#sa-arrow)"/>
  <!-- CI Runner -->
  <rect x="480" y="20" width="130" height="50" rx="8" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="545" y="41" text-anchor="middle" fill="currentColor" font-size="9" font-weight="600">CI runner</text>
  <text x="545" y="55" text-anchor="middle" fill="#64748b" font-size="8">authenticates</text>
  <line x1="610" y1="45" x2="630" y2="45" stroke="#64748b" stroke-width="1.5" marker-end="url(#sa-arrow)"/>
  <!-- Publishes -->
  <rect x="635" y="20" width="100" height="50" rx="8" fill="none" stroke="#16a34a" stroke-width="1.5"/>
  <text x="685" y="41" text-anchor="middle" fill="#16a34a" font-size="9" font-weight="600">Publishes</text>
  <text x="685" y="55" text-anchor="middle" fill="#64748b" font-size="8">@org scope</text>
</svg>
</div>

For teams that need a shared CI identity (not tied to a personal account), admins can create service accounts via the API:

```bash
curl -X POST https://tankpkg.dev/api/admin/service-accounts \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "displayName": "CI Bot",
    "description": "GitHub Actions automation",
    "scopes": ["skills:read"],
    "expiresInDays": 90,
    "keyName": "ci-key"
  }'
```

Service account tokens work identically to personal tokens — set `TANK_TOKEN` and `tank install` picks it up.

Use service accounts when:

- Multiple repos share one CI identity
- You need audit trails separate from personal accounts
- Team members leave and you don't want to rotate personal tokens

## Security Best Practices

- **Scope minimization**: CI consumers need `skills:read` only
- **Key rotation**: Set short expiry and rotate before it lapses
- **Never log the token**: Mask `TANK_TOKEN` in CI output
- **Pin lockfile**: Always commit `tank.lock` — never run `tank install @org/skill` directly in CI
- **Audit scores**: Prefer skills with audit score ≥ 8/10
- **Review permission changes**: If `tank permissions` output changes unexpectedly after `tank update`, investigate before merging

## Troubleshooting

### `401 Unauthorized`

Token is invalid or expired. Create a new one from [Settings → Tokens](/tokens).

### `tank install` resolves versions instead of using lockfile

`tank.lock` is missing or out of sync. Run `tank install` locally, commit the lockfile, push.

### Permission budget exceeded

A skill requests permissions beyond your `tank.json` budget. Either widen the budget (review carefully) or choose a different skill.

### GitHub Action not found

Ensure the action is referenced as `tankpkg/tank@v1` (not `tank/tank`). See the [GitHub Action docs](/docs/github-action) for the full reference.
