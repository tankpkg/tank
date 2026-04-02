---
title: GitHub Action for Publishing
description: Automate AI agent skill publishing with Tank's official GitHub Action — security scanning, version validation, and badge generation in your CI/CD pipeline.
---

# GitHub Action for Publishing

Tank's official GitHub Action automates the full skill publishing lifecycle directly from your CI/CD pipeline. On every push to `main`, the action validates your skill manifest, runs security scanning, publishes to the Tank registry, and generates an audit score badge you can embed in your README.

<div class="my-6 flex justify-center overflow-x-auto">
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 820 150" class="max-w-full" style="font-family: 'Space Grotesk', sans-serif;">
  <defs>
    <marker id="ga-arrow" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto"><path d="M0,0 L8,3 L0,6" fill="#64748b"/></marker>
  </defs>
  <!-- Push to main -->
  <rect x="10" y="45" width="110" height="50" rx="10" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="65" y="67" text-anchor="middle" fill="currentColor" font-size="12" font-weight="600">Push to main</text>
  <text x="65" y="82" text-anchor="middle" fill="#64748b" font-size="10">or v* tag</text>
  <!-- Arrow -->
  <line x1="120" y1="70" x2="150" y2="70" stroke="#64748b" stroke-width="1.5" marker-end="url(#ga-arrow)"/>
  <!-- Action -->
  <rect x="155" y="45" width="130" height="50" rx="10" fill="none" stroke="#10b981" stroke-width="1.5"/>
  <text x="220" y="67" text-anchor="middle" fill="#10b981" font-size="11" font-weight="600">tankpkg/tank@v1</text>
  <text x="220" y="82" text-anchor="middle" fill="#64748b" font-size="10">GitHub Action</text>
  <!-- Arrow -->
  <line x1="285" y1="70" x2="315" y2="70" stroke="#64748b" stroke-width="1.5" marker-end="url(#ga-arrow)"/>
  <!-- Validate -->
  <rect x="320" y="45" width="100" height="50" rx="10" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="370" y="67" text-anchor="middle" fill="currentColor" font-size="12" font-weight="600">Validate</text>
  <text x="370" y="82" text-anchor="middle" fill="#64748b" font-size="10">manifest</text>
  <!-- Arrow -->
  <line x1="420" y1="70" x2="445" y2="70" stroke="#64748b" stroke-width="1.5" marker-end="url(#ga-arrow)"/>
  <!-- Security Scan -->
  <rect x="450" y="45" width="110" height="50" rx="10" fill="none" stroke="#dc2626" stroke-width="1.5"/>
  <text x="505" y="67" text-anchor="middle" fill="#dc2626" font-size="12" font-weight="600">Scan</text>
  <text x="505" y="82" text-anchor="middle" fill="#64748b" font-size="10">6-stage pipeline</text>
  <!-- Arrow -->
  <line x1="560" y1="70" x2="585" y2="70" stroke="#64748b" stroke-width="1.5" marker-end="url(#ga-arrow)"/>
  <!-- Publish -->
  <rect x="590" y="45" width="90" height="50" rx="10" fill="none" stroke="#16a34a" stroke-width="1.5"/>
  <text x="635" y="74" text-anchor="middle" fill="#16a34a" font-size="13" font-weight="600">Publish</text>
  <!-- Arrow -->
  <line x1="680" y1="70" x2="710" y2="70" stroke="#64748b" stroke-width="1.5" marker-end="url(#ga-arrow)"/>
  <!-- Outputs -->
  <rect x="715" y="25" width="95" height="90" rx="8" fill="none" stroke="#10b981" stroke-width="1.5" stroke-dasharray="4,3"/>
  <text x="762" y="47" text-anchor="middle" fill="#10b981" font-size="11" font-weight="600">Outputs</text>
  <text x="762" y="65" text-anchor="middle" fill="#64748b" font-size="10">name</text>
  <text x="762" y="78" text-anchor="middle" fill="#64748b" font-size="10">version</text>
  <text x="762" y="91" text-anchor="middle" fill="#64748b" font-size="10">audit-score</text>
  <text x="762" y="104" text-anchor="middle" fill="#64748b" font-size="10">badge-url</text>
</svg>
</div>

<Callout type="info">
  The action uses the same `tank publish` flow under the hood. It reads your `TANK_TOKEN` secret, authenticates, and
  publishes — no interactive login needed in CI.
</Callout>

## Quick Start

Add this step to your workflow after checking out your code:

```yaml
- uses: tankpkg/tank@v1
  with:
    token: ${{ secrets.TANK_TOKEN }}
```

That's the minimum configuration. The action publishes from the repository root using the hosted Tank registry.

To get your `TANK_TOKEN`, go to [Dashboard → Tokens](/tokens), create a token with the `skills:publish` scope, and add it to your repository's secrets at **Settings → Secrets and variables → Actions → New repository secret**.

## Inputs

| Input       | Required | Default               | Description                                                                   |
| ----------- | -------- | --------------------- | ----------------------------------------------------------------------------- |
| `token`     | **Yes**  | —                     | Your Tank API token. Always use `${{ secrets.TANK_TOKEN }}` — never hardcode. |
| `registry`  | No       | `https://tankpkg.dev` | Registry URL. Override for self-hosted deployments.                           |
| `directory` | No       | `.`                   | Directory containing `tank.json`. Use if your skill is not at the repo root.  |
| `dry-run`   | No       | `false`               | When `true`, validates and scans but does not publish. Use on pull requests.  |

## Outputs

| Output        | Description                                                          |
| ------------- | -------------------------------------------------------------------- |
| `name`        | The published skill name (e.g. `@acme/my-skill`)                     |
| `version`     | The published version (e.g. `1.2.0`)                                 |
| `audit-score` | Numeric audit score from 0 to 10                                     |
| `badge-url`   | SVG badge URL — embed in your README to show the current audit score |

Access outputs in subsequent steps using `steps.<step-id>.outputs.<output-name>`.

## Full Workflow Example

This workflow publishes on every push to `main` and posts a comment on pull requests with the audit score and badge:

```yaml
name: Publish Skill to Tank

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  publish:
    runs-on: ubuntu-latest
    permissions:
      pull-requests: write # needed to post PR comments

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: "24"

      - name: Publish to Tank
        id: tank
        uses: tankpkg/tank@v1
        with:
          token: ${{ secrets.TANK_TOKEN }}
          directory: .
          dry-run: ${{ github.event_name == 'pull_request' }}

      - name: Comment audit score on PR
        if: github.event_name == 'pull_request'
        uses: actions/github-script@v7
        with:
          script: |
            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: `## Tank Audit Results\n\n**Skill:** \`${{ steps.tank.outputs.name }}\`\n**Version:** ${{ steps.tank.outputs.version }}\n**Audit Score:** ${{ steps.tank.outputs.audit-score }}/10\n\n![Audit Score](${{ steps.tank.outputs.badge-url }})`
            })
```

## Dry Run for Pull Requests

Run validation on every pull request without publishing. This catches permission escalations, manifest errors, and security findings before they merge:

```yaml
name: Validate Skill on PR

on:
  pull_request:
    branches: [main]

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: "24"

      - name: Dry-run validation
        id: tank
        uses: tankpkg/tank@v1
        with:
          token: ${{ secrets.TANK_TOKEN }}
          dry-run: true

      - name: Fail on low audit score
        if: ${{ steps.tank.outputs.audit-score < 7 }}
        run: |
          echo "Audit score ${{ steps.tank.outputs.audit-score }}/10 is below threshold (7)"
          exit 1
```

<Callout type="warn">
  Dry runs still require a valid `TANK_TOKEN` — the action authenticates to run the security scan against the registry's
  scanning infrastructure, even without publishing.
</Callout>

The action exits with a non-zero code if:

- `tank.json` is invalid or missing required fields
- Security scanning returns a `FAIL` verdict (1+ critical or 4+ high severity findings)
- The version has already been published (Tank enforces immutability)
- Permission escalation is detected (see [Publishing](/docs/publishing) for escalation rules)

## Badge Integration

The `badge-url` output points to a dynamically generated SVG badge hosted by the Tank registry. Add it to your `README.md` to show the current audit score:

```markdown
[![Tank Audit Score](https://tankpkg.dev/api/v1/badge/@acme/my-skill)](https://tankpkg.dev/skills/@acme/my-skill)
```

The badge updates automatically when you publish a new version — no manual badge URL changes needed.

### Automated Badge Update via Workflow

After publishing, update your README badge URL automatically using the `badge-url` output:

```yaml
- name: Update README badge
  if: github.event_name == 'push' && github.ref == 'refs/heads/main'
  run: |
    sed -i "s|https://tankpkg.dev/api/v1/badge/.*)|${{ steps.tank.outputs.badge-url }})|g" README.md
    git config user.name "github-actions[bot]"
    git config user.email "github-actions[bot]@users.noreply.github.com"
    git add README.md
    git diff --staged --quiet || git commit -m "chore: update Tank audit badge"
    git push
```

<Callout type="info">
  Badge colors follow Tank's scoring thresholds: **green** (7–10), **yellow** (4–6), **red** (0–3). The badge is a
  static SVG served from the Tank CDN — it renders correctly on GitHub, npm, and anywhere else markdown badges are
  supported.
</Callout>

## Publishing from a Monorepo

If your repository contains multiple skills in subdirectories, run the action once per skill using a matrix strategy:

```yaml
jobs:
  publish:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        skill:
          - path: skills/browser-automation
            name: "@acme/browser-automation"
          - path: skills/code-review
            name: "@acme/code-review"

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: "24"

      - name: Publish ${{ matrix.skill.name }}
        uses: tankpkg/tank@v1
        with:
          token: ${{ secrets.TANK_TOKEN }}
          directory: ${{ matrix.skill.path }}
```

## Combining with `tank install` for Consumers

If your project both **publishes** skills and **installs** skills from the registry as dependencies, you'll use the action for publishing and the CLI directly for installation:

```yaml
steps:
  # Install skill dependencies first
  - name: Install Tank CLI
    run: npm i -g @tankpkg/cli

  - name: Install skills
    env:
      TANK_TOKEN: ${{ secrets.TANK_TOKEN }}
    run: |
      tank install
      tank verify

  # Then run your tests / build

  # Finally, publish the skill itself
  - name: Publish to Tank
    uses: tankpkg/tank@v1
    with:
      token: ${{ secrets.TANK_TOKEN }}
```

For full documentation on installing skills in CI, see the [CI/CD Integration guide](/docs/cicd).

## Self-Hosted Registry

Point the action at your own Tank instance using the `registry` input:

```yaml
- uses: tankpkg/tank@v1
  with:
    token: ${{ secrets.TANK_TOKEN }}
    registry: https://tank.internal.acme.com
```

The `TANK_TOKEN` must be issued by your self-hosted registry — tokens from the public registry won't work against a different instance.

## Troubleshooting

### `401 Unauthorized`

The `TANK_TOKEN` secret is missing, expired, or lacks the `skills:publish` scope. Create a new token at [Dashboard → Tokens](/tokens) with `skills:publish` scope and update your secret.

### `Version already published`

Tank enforces version immutability. Increment the version in your `tank.json` before pushing. Patch → `1.0.1`, minor → `1.1.0`, major → `2.0.0`.

### `Security scan returned FAIL`

The scanner found critical or high-severity issues. Run `tank audit` locally to see the full report:

```bash
tank audit --local .
```

Address the findings before pushing. Common causes: hardcoded API keys, `eval()` on untrusted input, or broad filesystem write permissions.

### `Permission escalation rejected`

You added new permissions in a patch (`1.0.x`) or dangerous permissions (network, subprocess) in a minor bump. See the [Publishing guide](/docs/publishing) for Tank's permission escalation policy.
