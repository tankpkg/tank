---
title: Releases & Nightly Builds
description: Tank's release channels — stable releases, nightly builds, Docker images, npm packages, and environment wiring.
---

# Releases & Nightly Builds

Tank uses two release channels: **stable** for production use and **nightly** for early access to upcoming features.

<div class="my-6 flex justify-center overflow-x-auto">
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 820 230" class="max-w-full" style="font-family: 'Space Grotesk', sans-serif;">
  <rect x="15" y="12" width="385" height="175" rx="10" fill="none" stroke="#16a34a" stroke-width="1.5"/>
  <rect x="19" y="16" width="60" height="20" rx="5" fill="#16a34a"/>
  <text x="49" y="30" text-anchor="middle" fill="white" font-size="9" font-weight="600">Stable</text>
  <text x="207.5" y="54" text-anchor="middle" fill="currentColor" font-size="10" font-weight="600">Use for production</text>
  <text x="35" y="80" fill="#64748b" font-size="9">Version</text>
  <text x="110" y="80" fill="currentColor" font-size="9" font-weight="600">v0.11.0 tag</text>
  <text x="35" y="100" fill="#64748b" font-size="9">Artifacts</text>
  <text x="110" y="100" fill="currentColor" font-size="9">npm @latest · Docker :latest</text>
  <text x="110" y="116" fill="currentColor" font-size="9">GitHub Release · Homebrew</text>
  <text x="35" y="140" fill="#64748b" font-size="9">Registry</text>
  <text x="110" y="140" fill="#16a34a" font-size="9" font-weight="600">www.tankpkg.dev</text>
  <text x="35" y="164" fill="#64748b" font-size="9">Meaning</text>
  <text x="110" y="164" fill="currentColor" font-size="9">tested, reviewed, production-ready</text>

  <rect x="420" y="12" width="385" height="175" rx="10" fill="none" stroke="#eab308" stroke-width="1.5" stroke-dasharray="4,3"/>
  <rect x="424" y="16" width="62" height="20" rx="5" fill="#eab308"/>
  <text x="455" y="30" text-anchor="middle" fill="white" font-size="9" font-weight="600">Nightly</text>
  <text x="612.5" y="54" text-anchor="middle" fill="currentColor" font-size="10" font-weight="600">Use for testing upcoming changes</text>
  <text x="440" y="80" fill="#64748b" font-size="9">Version</text>
  <text x="515" y="80" fill="currentColor" font-size="9" font-weight="600">0.0.0-nightly.xxx</text>
  <text x="440" y="100" fill="#64748b" font-size="9">Artifacts</text>
  <text x="515" y="100" fill="currentColor" font-size="9">npm @nightly · Docker :nightly</text>
  <text x="440" y="140" fill="#64748b" font-size="9">Registry</text>
  <text x="515" y="140" fill="#eab308" font-size="9" font-weight="600">nightly.tankpkg.dev</text>
  <text x="440" y="164" fill="#64748b" font-size="9">Warning</text>
  <text x="515" y="164" fill="#dc2626" font-size="9" font-weight="600">may contain breaking changes</text>

  <rect x="15" y="198" width="790" height="18" rx="6" fill="currentColor" fill-opacity="0.04" stroke="currentColor" stroke-width="1" stroke-dasharray="4,3" opacity="0.3"/>
  <text x="410" y="211" text-anchor="middle" fill="currentColor" font-size="10" font-weight="600">Stable = production. Nightly = testing preview builds.</text>
</svg>
</div>

## Release Channels

| Channel     | Web Registry                                       | Scanner                                                            | CLI                             | Docker Images                      |
| ----------- | -------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------- | ---------------------------------- |
| **Stable**  | [www.tankpkg.dev](https://www.tankpkg.dev)         | [scanner.tankpkg.dev](https://scanner.tankpkg.dev)                 | `npm i -g @tankpkg/cli`         | `ghcr.io/tankpkg/tank-web:latest`  |
| **Nightly** | [nightly.tankpkg.dev](https://nightly.tankpkg.dev) | [nightly-scanner.tankpkg.dev](https://nightly-scanner.tankpkg.dev) | `npm i -g @tankpkg/cli@nightly` | `ghcr.io/tankpkg/tank-web:nightly` |

## Stable Releases

<div class="my-6 flex justify-center overflow-x-auto">
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 820 215" class="max-w-full" style="font-family: 'Space Grotesk', sans-serif;">
  <defs>
    <marker id="rc-arrow" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto"><path d="M0,0 L8,3 L0,6" fill="#64748b"/></marker>
  </defs>
  <!-- Tag push -->
  <rect x="15" y="78" width="145" height="50" rx="10" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="87.5" y="100" text-anchor="middle" fill="currentColor" font-size="11" font-weight="600">v* tag push</text>
  <text x="87.5" y="116" text-anchor="middle" fill="#64748b" font-size="9">triggers CI</text>
  <!-- Fan-out lines -->
  <line x1="160" y1="88" x2="285" y2="26" stroke="#64748b" stroke-width="1.5" marker-end="url(#rc-arrow)"/>
  <line x1="160" y1="94" x2="285" y2="64" stroke="#64748b" stroke-width="1.5" marker-end="url(#rc-arrow)"/>
  <line x1="160" y1="102" x2="285" y2="102" stroke="#64748b" stroke-width="1.5" marker-end="url(#rc-arrow)"/>
  <line x1="160" y1="110" x2="285" y2="140" stroke="#64748b" stroke-width="1.5" marker-end="url(#rc-arrow)"/>
  <line x1="160" y1="118" x2="285" y2="178" stroke="#64748b" stroke-width="1.5" marker-end="url(#rc-arrow)"/>
  <!-- npm -->
  <rect x="285" y="12" width="230" height="28" rx="8" fill="none" stroke="#10b981" stroke-width="1.5"/>
  <text x="400" y="31" text-anchor="middle" fill="#10b981" font-size="10" font-weight="600">npm — @tankpkg/cli</text>
  <!-- Docker -->
  <rect x="285" y="50" width="230" height="28" rx="8" fill="none" stroke="#10b981" stroke-width="1.5"/>
  <text x="400" y="69" text-anchor="middle" fill="#10b981" font-size="10" font-weight="600">Docker — ghcr.io images</text>
  <!-- GitHub Release -->
  <rect x="285" y="88" width="230" height="28" rx="8" fill="none" stroke="#10b981" stroke-width="1.5"/>
  <text x="400" y="107" text-anchor="middle" fill="#10b981" font-size="10" font-weight="600">GitHub Release — binaries</text>
  <!-- Homebrew -->
  <rect x="285" y="126" width="230" height="28" rx="8" fill="none" stroke="#10b981" stroke-width="1.5"/>
  <text x="400" y="145" text-anchor="middle" fill="#10b981" font-size="10" font-weight="600">Homebrew — formula</text>
  <!-- Vercel -->
  <rect x="285" y="164" width="230" height="28" rx="8" fill="none" stroke="#16a34a" stroke-width="1.5"/>
  <text x="400" y="183" text-anchor="middle" fill="#16a34a" font-size="10" font-weight="600">Vercel — www.tankpkg.dev</text>
  <!-- parallel label -->
  <rect x="545" y="92" width="170" height="24" rx="6" fill="currentColor" fill-opacity="0.04" stroke="currentColor" stroke-width="1" stroke-dasharray="3,2" opacity="0.3"/>
  <text x="630" y="108" text-anchor="middle" fill="#64748b" font-size="9" font-weight="600">all 5 publish jobs run in parallel</text>
</svg>
</div>

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
