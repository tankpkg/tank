---
title: Self-Host in 15 Minutes
description: Get Tank running on your own infrastructure with Docker Compose — automated setup wizard, no manual configuration needed.
---

# Self-Host in 15 Minutes

Get a fully functional Tank registry running on your infrastructure with a single `docker compose up`.

<div class="my-6 flex justify-center overflow-x-auto">
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 100" class="max-w-full" style="font-family: 'Space Grotesk', sans-serif;">
  <defs>
    <marker id="sh-arrow" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
      <path d="M0,0 L8,3 L0,6" fill="#64748b"/>
    </marker>
  </defs>
  <rect x="10" y="20" width="140" height="55" rx="10" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="80" y="40" text-anchor="middle" fill="#64748b" font-weight="600" font-size="11">1</text>
  <text x="80" y="58" text-anchor="middle" fill="currentColor" font-weight="600" font-size="13">Download YAML</text>
  <line x1="150" y1="47" x2="180" y2="47" stroke="#64748b" stroke-width="1.5" marker-end="url(#sh-arrow)"/>
  <rect x="185" y="20" width="140" height="55" rx="10" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="255" y="40" text-anchor="middle" fill="#64748b" font-weight="600" font-size="11">2</text>
  <text x="255" y="58" text-anchor="middle" fill="currentColor" font-weight="600" font-size="13">Create .env</text>
  <line x1="325" y1="47" x2="355" y2="47" stroke="#64748b" stroke-width="1.5" marker-end="url(#sh-arrow)"/>
  <rect x="360" y="20" width="160" height="55" rx="10" fill="none" stroke="#10b981" stroke-width="1.5"/>
  <text x="440" y="40" text-anchor="middle" fill="#64748b" font-weight="600" font-size="11">3</text>
  <text x="440" y="58" text-anchor="middle" fill="#10b981" font-weight="600" font-size="13">docker compose up</text>
  <line x1="520" y1="47" x2="550" y2="47" stroke="#64748b" stroke-width="1.5" marker-end="url(#sh-arrow)"/>
  <rect x="555" y="20" width="155" height="55" rx="10" fill="none" stroke="#16a34a" stroke-width="1.5"/>
  <text x="632" y="40" text-anchor="middle" fill="#64748b" font-weight="600" font-size="11">4</text>
  <text x="632" y="58" text-anchor="middle" fill="#16a34a" font-weight="600" font-size="13">Setup Wizard</text>
  <text x="632" y="72" text-anchor="middle" fill="#64748b" font-weight="600" font-size="10">/setup</text>
</svg>
</div>

## Prerequisites

- Docker Engine 24+ and Docker Compose v2
- 4 GB RAM, 20 GB disk
- A domain pointing to your server (or use localhost for testing)

## Quick Start

### Minimal `docker run` (single Tank container)

If you already have a PostgreSQL database URL, you can preview Tank with a single `tank-web` container and local filesystem storage.

> **Trade-off**: this is the smallest possible preview setup. For publishing scans and S3-compatible package storage, use the full compose file with RustFS + scanner.

```bash
docker run --rm -p 3000:3000 \
  -e DATABASE_URL='postgresql://USER:PASSWORD@HOST:5432/DBNAME' \
  -e BETTER_AUTH_SECRET='change-me' \
  -e APP_URL='http://localhost:3000' \
  -e STORAGE_BACKEND='filesystem' \
  -e STORAGE_FS_PATH='/app/data/packages' \
  -e TANK_MODE='selfhosted' \
  -e AUTO_MIGRATE='true' \
  -e AUTH_PROVIDERS='credentials' \
  -v tank-data:/app/data \
  ghcr.io/tankpkg/tank-web:latest
```

Use this when you want to try the UI and setup flow without running separate storage containers.

### 1. Create a directory and download the compose file

```bash
mkdir tank && cd tank
curl -fsSL https://raw.githubusercontent.com/tankpkg/tank/main/infra/docker-compose.production.yml -o docker-compose.yml
```

### 2. Create your environment file

```bash
cat > .env << 'EOF'
# Required — generate a unique secret
BETTER_AUTH_SECRET=$(openssl rand -base64 32)

# Database (uses bundled PostgreSQL)
DATABASE_URL=postgresql://tank:tank@postgres:5432/tank

# Your registry URL (change for production)
APP_URL=http://localhost:3000

# Scanner
PYTHON_API_URL=http://scanner:8000

# Headless admin bootstrap (optional — or use the web wizard)
# FIRST_ADMIN_EMAIL=admin@yourcompany.com
# FIRST_ADMIN_PASSWORD=changeme123

# Override default registry URL (for CLI pointing to this instance)
# TANK_REGISTRY_URL=http://localhost:3000
EOF
```

> **Tip**: For automated deployments without the web wizard, uncomment `FIRST_ADMIN_EMAIL` and `FIRST_ADMIN_PASSWORD`.

### 3. Start everything

```bash
docker compose up -d
```

> **Image tags**: The compose file builds from source by default (no internet needed). For pre-built images, edit `docker-compose.production.yml` and use `:latest` (stable) or `:nightly` (bleeding edge).

This starts PostgreSQL, RustFS (storage), the security scanner, and the Tank web app. Database tables are created automatically on first boot.

> **Note on Images**: By default, `docker compose up` uses the `:nightly` image tags to ensure you have the latest features. For production environments, we strongly recommend pinning to a specific version tag (e.g., `:v0.8.1`) or the `:latest` stable tag.

### 4. Open the Setup Wizard

Visit `http://localhost:3000/setup` in your browser. The wizard walks you through:

1. **Database** — connection is pre-configured from your `.env`
2. **URL** — confirm your registry's public URL
3. **Storage** — choose RustFS (default), S3, or local filesystem
4. **Admin Account** — create your first admin user
5. **Authentication** — optionally configure GitHub OAuth or OIDC SSO
6. **Scanner** — configure LLM for enhanced security analysis (optional)
7. **Complete** — save configuration and start using Tank

### 5. Verify

```bash
# Health check
curl http://localhost:3000/api/health
# → {"status":"ok"}

# Point your CLI to your instance
tank login --registry http://localhost:3000
```

## What's Next

- **Add GitHub OAuth**: Create a [GitHub OAuth App](https://github.com/settings/developers) with callback URL `https://your-domain/api/auth/callback/github`
- **Add OIDC SSO**: Configure your identity provider in the setup wizard or via env vars
- **Production hardening**: See the full [Self-Hosting Guide](/docs/self-hosting) for TLS, backups, monitoring, and Kubernetes deployment
- **Local LLM**: Add `--profile llm-local` to use Ollama for security analysis without external API calls

## Headless Mode (CI/CD)

For fully automated deployments without the wizard:

```bash
FIRST_ADMIN_EMAIL=admin@co.com \
FIRST_ADMIN_PASSWORD=securepassword \
AUTO_MIGRATE=true \
docker compose up -d
```

This creates the admin user and skips the setup wizard entirely.
