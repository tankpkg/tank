# Tank Product Brief

What Tank is, why it exists, and which product claims are true in the current repo.

## Positioning

Tank is a security-first package manager and registry for AI agent skills.

Current shipped pillars in this repo:

- `skills.json` manifest validation
- `skills.lock` lockfile support
- publish/install/update flows
- permission budgets at install time
- permission escalation checks on publish
- 6-stage security scanning service
- registry UI, API, dashboard, and admin flows

## Problem

Agent skills are more dangerous than ordinary packages because they operate with the agent's authority. A malicious skill can combine filesystem access, network access, and subprocess execution through the host agent.

ClawHavoc is the motivating incident: a marketplace shipped hundreds of malicious skills without meaningful review or enforcement.

## Current Security Story

Implemented:

- publish-time manifest validation
- install-time SHA-512 integrity verification
- install-time permission budget checks
- publish-time permission escalation checks
- scanner verdicts and stored findings
- audit score computation

Planned, not implemented in this repo:

- runtime sandbox enforcement
- signing/provenance features beyond current integrity verification

## Product Shape

- `CLI → local authoring, install, publish, verify, audit, linking`
- `MCP server → editor-facing tool interface with CLI parity`
- `Web → registry browse, docs, auth, dashboard, admin, public API`
- `Scanner → deep security analysis service`

## Non-Goals For Agent Docs

Do not present roadmap items as shipped behavior. If a feature is planned, label it as planned.
