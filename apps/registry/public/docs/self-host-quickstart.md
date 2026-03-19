---
title: Self-Host in 15 Minutes
description: Deploy your own Tank registry and security scanner on-premise with Docker Compose or Kubernetes Helm charts — complete with PostgreSQL, MinIO, and AI-powered security scanning.
---

# Self-Host in 15 Minutes

Deploy Tank on your own infrastructure for complete control over your AI skill registry and security scanning.

## Why Self-Host?

- **Data sovereignty** — Skills and metadata never leave your infrastructure
- **Air-gapped support** — Deploy in environments without internet access
- **Custom policies** — Implement organization-specific security rules
- **Compliance** — Meet regulatory requirements (SOC2, HIPAA, etc.)

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     Your Infrastructure                       │
│                                                              │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐     │
│  │  TanStack   │───▶│  PostgreSQL │    │    S3/MinIO │     │
│  │   Web App   │    │   Database  │    │   Storage   │     │
│  └─────────────┘    └─────────────┘    └─────────────┘     │
│         │                                                   │
│         ▼                                                   │
│  ┌─────────────┐                                           │
│  │   FastAPI   │                                           │
│  │   Security  │                                           │
│  │   Scanner   │                                           │
│  └─────────────┘                                           │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Prerequisites

- Docker and Docker Compose
- 4GB RAM minimum (8GB recommended)
- PostgreSQL 17+ (or use provided Docker config)
- S3-compatible storage (or MinIO)

## Step 1: Clone and Configure

```bash
git clone https://github.com/tankpkg/tank.git
cd tank
cp .env.example .env
```

Edit `.env` with your values:

```bash
# Database
DATABASE_URL=postgresql://tank:password@localhost:5432/tank

# Storage (choose one)
STORAGE_BACKEND=s3
S3_ENDPOINT=http://localhost:9000
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
S3_BUCKET=tank-skills

# Auth
APP_URL=https://tank.yourcompany.com
BETTER_AUTH_SECRET=$(openssl rand -base64 32)
GITHUB_CLIENT_ID=your-github-oauth-id
GITHUB_CLIENT_SECRET=your-github-oauth-secret

# Admin bootstrap
FIRST_ADMIN_EMAIL=admin@yourcompany.com

# Security scanner
PYTHON_API_URL=http://scanner:8000
```

## Step 2: Start Services

Using Docker Compose:

```bash
docker compose up -d
```

This starts:

- TanStack Start web application (port 3000)
- PostgreSQL database (port 5432)
- MinIO S3-compatible storage (port 9000)
- Python security scanner (port 8000)

**Optional — Local LLM analysis:**

```bash
# Enable Ollama for local AI-powered security analysis
docker compose --profile llm-local up -d
```

## Step 3: Run Database Migrations

```bash
docker compose exec web bun --filter=@tankpkg/web drizzle-kit push
```

## Step 4: Create Admin User

```bash
docker compose exec web bun --filter=@tankpkg/web admin:bootstrap
```

Promotes `FIRST_ADMIN_EMAIL` to admin role. The user must sign in with GitHub OAuth first to create their account, then you run bootstrap.

## Step 5: Configure OIDC SSO (Optional)

For enterprise single sign-on, add to `.env`:

```bash
OIDC_ISSUER=https://sso.yourcompany.com
OIDC_CLIENT_ID=tank-client
OIDC_CLIENT_SECRET=your-oidc-secret
```

Then restart the web service:

```bash
docker compose restart web
```

## Step 6: Verify Installation

```bash
# Check all services are running
docker compose ps

# Test the API
curl http://localhost:3000/api/health
curl http://localhost:3000/api/v1/skills

# Test security scanner
curl http://localhost:8000/health
```

## Kubernetes (Helm) Quick Start

For Kubernetes deployments, use the Helm chart at `helm/tank/`:

```bash
# Update chart dependencies (PostgreSQL, MinIO)
helm dependency update helm/tank/

# Install into the tank namespace
helm dependency update helm/tank/ && helm install tank helm/tank/ \
  --namespace tank \
  --create-namespace \
  --set secrets.betterAuthSecret="$(openssl rand -base64 32)" \
  --set dbMigration.force=true
```

After install, configure your ingress and DNS. See the [full self-hosting guide](/docs/self-hosting) for Helm values reference and production configuration.

## Production Checklist

- [ ] Change default MinIO credentials (`minioadmin`/`minioadmin`)
- [ ] Set strong `BETTER_AUTH_SECRET` (min 32 characters, `openssl rand -base64 32`)
- [ ] Configure TLS/SSL certificates
- [ ] Set up database backups (daily minimum)
- [ ] Configure log aggregation (Loki + Grafana included)
- [ ] Review firewall rules — only expose port 3000 publicly
- [ ] Set token expiry policies for API keys
- [ ] Configure `FIRST_ADMIN_EMAIL` and bootstrap before going live

## Monitoring

Access the included observability stack:

- **Grafana**: `http://localhost:3001` (admin/admin — change on first login)
- **Loki**: Log aggregation (pre-configured)
- **Prometheus**: Metrics collection

Default dashboards:

- Tank API performance
- Security scan latency
- Skill publish/download rates

## Upgrading

```bash
git pull origin main
docker compose pull
docker compose up -d
```

Migrations run automatically on startup.

**For Helm upgrades:**

```bash
helm upgrade tank helm/tank/ \
  --namespace tank \
  --reuse-values
```

## Support

- **Documentation**: [Full self-hosting guide](/docs/self-hosting)
- **Community**: [GitHub Discussions](https://github.com/tankpkg/tank/discussions)
- **Enterprise support**: enterprise@tankpkg.dev
