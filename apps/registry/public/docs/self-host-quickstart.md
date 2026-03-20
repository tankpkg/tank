---
title: Self-Host in 15 Minutes
description: Get Tank running on your own infrastructure with Docker Compose — automated setup wizard, no manual configuration needed.
---

# Self-Host in 15 Minutes

Get a fully functional Tank registry running on your infrastructure with a single `docker compose up`.

## Prerequisites

- Docker Engine 24+ and Docker Compose v2
- 4 GB RAM, 20 GB disk
- A domain pointing to your server (or use localhost for testing)

## Quick Start

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
EOF
```

> **Tip**: For automated deployments without the web wizard, uncomment `FIRST_ADMIN_EMAIL` and `FIRST_ADMIN_PASSWORD`.

### 3. Start everything

```bash
docker compose up -d
```

This starts PostgreSQL, MinIO (storage), the security scanner, and the Tank web app. Database tables are created automatically on first boot.

### 4. Open the Setup Wizard

Visit `http://localhost:3000/setup` in your browser. The wizard walks you through:

1. **Database** — connection is pre-configured from your `.env`
2. **URL** — confirm your registry's public URL
3. **Storage** — choose MinIO (default), S3, or local filesystem
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
