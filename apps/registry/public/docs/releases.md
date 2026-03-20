---
title: Releases & Nightly Builds
description: Tank's release channels — stable releases, nightly builds, Docker images, npm packages, and environment wiring.
---

# Releases & Nightly Builds

Tank uses two release channels: **stable** for production use and **nightly** for early access to upcoming features.

## Release Channels

| Channel     | Web Registry                                       | Scanner                                                            | CLI                             | Docker Images                      |
| ----------- | -------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------- | ---------------------------------- |
| **Stable**  | [www.tankpkg.dev](https://www.tankpkg.dev)         | [scanner.tankpkg.dev](https://scanner.tankpkg.dev)                 | `npm i -g @tankpkg/cli`         | `ghcr.io/tankpkg/tank-web:latest`  |
| **Nightly** | [nightly.tankpkg.dev](https://nightly.tankpkg.dev) | [nightly-scanner.tankpkg.dev](https://nightly-scanner.tankpkg.dev) | `npm i -g @tankpkg/cli@nightly` | `ghcr.io/tankpkg/tank-web:nightly` |

## Stable Releases

Stable releases are triggered by pushing a `v*` tag (e.g., `v0.9.0`). This publishes:

- **npm**: `@tankpkg/cli` and `@tankpkg/mcp-server` with the `latest` tag
- **Docker**: `ghcr.io/tankpkg/tank-web:latest` and `tank-scanner:latest`, plus the version tag
- **GitHub Release**: Binaries for Linux (x64, arm64), macOS (x64, arm64), Windows (x64), plus `.deb` packages
- **Homebrew**: Formula updated automatically
- **Vercel**: www.tankpkg.dev and scanner.tankpkg.dev deployed from `stable` branch

## Nightly Builds

Nightly builds are published automatically from the `main` branch:

- **Schedule**: Daily at 4:00 AM UTC (Docker images) and 4:30 AM UTC (CLI/npm)
- **Trigger**: Also on every push to `main` that changes relevant paths
- **Version format**: `0.0.0-nightly.20260320.abc1234` (date + short SHA)

### What's Different in Nightly

| Aspect               | Stable              | Nightly                      |
| -------------------- | ------------------- | ---------------------------- |
| CLI default registry | www.tankpkg.dev     | nightly.tankpkg.dev          |
| Docker tag           | `:latest`           | `:nightly`                   |
| Scanner URL          | scanner.tankpkg.dev | nightly-scanner.tankpkg.dev  |
| Stability            | Production-ready    | May contain breaking changes |

### Using Nightly

```bash
# CLI
npm install -g @tankpkg/cli@nightly
tank search hello  # searches nightly.tankpkg.dev

# Docker
docker pull ghcr.io/tankpkg/tank-web:nightly
docker pull ghcr.io/tankpkg/tank-scanner:nightly
```

## Self-Hosted Releases

Self-hosted deployments build from source (no registry dependency):

```bash
git clone https://github.com/tankpkg/tank.git
cd tank
bash scripts/onprem-install.sh
```

To update a self-hosted instance:

```bash
git pull
docker compose -f infra/docker-compose.yml build
docker compose -f infra/docker-compose.yml up -d
```

See [Self-Hosting Tank](/docs/self-hosting) for the full deployment guide.

## Environment Variables for Service Wiring

Each deployment needs to know where its services are:

| Variable            | Stable                        | Nightly                               | Self-Hosted           |
| ------------------- | ----------------------------- | ------------------------------------- | --------------------- |
| `APP_URL`           | `https://www.tankpkg.dev`     | `https://nightly.tankpkg.dev`         | Your domain           |
| `PYTHON_API_URL`    | `https://scanner.tankpkg.dev` | `https://nightly-scanner.tankpkg.dev` | `http://scanner:8000` |
| `TANK_REGISTRY_URL` | `https://www.tankpkg.dev`     | `https://nightly.tankpkg.dev`         | Your domain           |

The `TANK_REGISTRY_URL` variable overrides the CLI's default registry:

```bash
# Point any CLI to your self-hosted instance
export TANK_REGISTRY_URL=https://tank.yourcompany.com
tank search hello
```

## CI/CD Integration

Use specific tags for reproducible builds:

```yaml
# Pinned version (recommended for production)
image: ghcr.io/tankpkg/tank-web:v0.9.0

# Pinned commit (most reproducible)
image: ghcr.io/tankpkg/tank-web:sha-abc1234

# Rolling nightly (for test pipelines)
image: ghcr.io/tankpkg/tank-web:nightly
```

See [CI/CD Integration](/docs/cicd) for full pipeline examples.

## Verifying Your Installation

```bash
# CLI version
tank --version

# Registry health
curl https://www.tankpkg.dev/api/health
curl https://nightly.tankpkg.dev/api/health

# Scanner health
curl https://scanner.tankpkg.dev/health
curl https://nightly-scanner.tankpkg.dev/health
```
