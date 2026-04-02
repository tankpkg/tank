---
title: Self-Hosting Tank
description: Deploy your own Tank registry on-premise — Docker Compose for quick setup, Kubernetes with Helm charts for production, with PostgreSQL, RustFS, and security scanning.
---

# Self-Hosting Tank

Deploy your own Tank registry for complete control over AI agent skill distribution and security scanning. Self-hosting provides data sovereignty, air-gapped support, custom security policies, and the ability to meet compliance requirements (SOC2, HIPAA, FedRAMP).

## Architecture Overview

A self-hosted Tank deployment runs four core services:

<svg viewBox="0 0 750 340" xmlns="http://www.w3.org/2000/svg" class="max-w-full" style="font-family: 'Space Grotesk', sans-serif;">
  <defs>
    <marker id="sh-arrow" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
      <path d="M0,0 L8,3 L0,6" fill="#64748b"/>
    </marker>
  </defs>
  <!-- Title -->
  <text x="375" y="22" text-anchor="middle" fill="currentColor" font-size="15" font-weight="600">Self-Hosted Deployment Topology</text>
  <!-- Outer boundary -->
  <rect x="15" y="40" width="720" height="290" rx="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="6,4"/>
  <text x="375" y="62" text-anchor="middle" fill="#64748b" font-size="11">Your Infrastructure</text>
  <!-- CLI/Browser -->
  <rect x="40" y="80" width="130" height="60" rx="10" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="105" y="105" text-anchor="middle" fill="currentColor" font-size="12" font-weight="600">CLI / Browser</text>
  <text x="105" y="125" text-anchor="middle" fill="#64748b" font-size="10">tank install, UI</text>
  <!-- Arrow to Web -->
  <line x1="170" y1="110" x2="235" y2="110" stroke="#64748b" stroke-width="1.5" marker-end="url(#sh-arrow)"/>
  <!-- Web App -->
  <rect x="240" y="75" width="180" height="75" rx="10" fill="none" stroke="#10b981" stroke-width="2"/>
  <text x="330" y="100" text-anchor="middle" fill="#10b981" font-size="13" font-weight="600">Web App + API</text>
  <text x="330" y="118" text-anchor="middle" fill="currentColor" font-size="10">TanStack Start</text>
  <text x="330" y="135" text-anchor="middle" fill="#64748b" font-size="10">:3000</text>
  <!-- Arrow to PostgreSQL -->
  <line x1="420" y1="95" x2="500" y2="95" stroke="#64748b" stroke-width="1.5" marker-end="url(#sh-arrow)"/>
  <!-- PostgreSQL -->
  <rect x="505" y="75" width="130" height="60" rx="10" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="570" y="100" text-anchor="middle" fill="currentColor" font-size="12" font-weight="600">PostgreSQL 17</text>
  <text x="570" y="118" text-anchor="middle" fill="#64748b" font-size="10">:5432</text>
  <!-- Arrow to RustFS -->
  <line x1="420" y1="130" x2="500" y2="190" stroke="#64748b" stroke-width="1.5" marker-end="url(#sh-arrow)"/>
  <!-- RustFS -->
  <rect x="505" y="170" width="130" height="60" rx="10" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="570" y="195" text-anchor="middle" fill="currentColor" font-size="12" font-weight="600">RustFS (S3)</text>
  <text x="570" y="215" text-anchor="middle" fill="#64748b" font-size="10">:9000 (tarballs)</text>
  <!-- Arrow to Scanner -->
  <line x1="330" y1="150" x2="330" y2="225" stroke="#64748b" stroke-width="1.5" marker-end="url(#sh-arrow)"/>
  <!-- Scanner -->
  <rect x="240" y="230" width="180" height="75" rx="10" fill="none" stroke="#dc2626" stroke-width="1.5"/>
  <text x="330" y="255" text-anchor="middle" fill="#dc2626" font-size="13" font-weight="600">Security Scanner</text>
  <text x="330" y="273" text-anchor="middle" fill="currentColor" font-size="10">FastAPI + Python 3.14</text>
  <text x="330" y="290" text-anchor="middle" fill="#64748b" font-size="10">:8000 (6-stage pipeline)</text>
  <!-- Arrow from Scanner to PG -->
  <line x1="420" y1="270" x2="505" y2="135" stroke="#64748b" stroke-width="1" stroke-dasharray="4,3" marker-end="url(#sh-arrow)"/>
  <!-- Optional Ollama -->
  <rect x="55" y="240" width="140" height="55" rx="8" fill="none" stroke="#64748b" stroke-width="1" stroke-dasharray="4,3"/>
  <text x="125" y="262" text-anchor="middle" fill="#64748b" font-size="11" font-weight="600">Ollama (optional)</text>
  <text x="125" y="280" text-anchor="middle" fill="#64748b" font-size="9">local LLM analysis</text>
  <line x1="195" y1="267" x2="237" y2="267" stroke="#64748b" stroke-width="1" stroke-dasharray="3,3" marker-end="url(#sh-arrow)"/>
  <!-- Monitoring -->
  <rect x="55" y="170" width="140" height="55" rx="8" fill="none" stroke="#64748b" stroke-width="1" stroke-dasharray="4,3"/>
  <text x="125" y="192" text-anchor="middle" fill="#64748b" font-size="11" font-weight="600">Grafana + Loki</text>
  <text x="125" y="210" text-anchor="middle" fill="#64748b" font-size="9">:3001 (monitoring)</text>
</svg>

| Service              | Technology             | Purpose                             |
| -------------------- | ---------------------- | ----------------------------------- |
| **Web app**          | TanStack Start         | Registry UI, REST API, CLI backend  |
| **Security scanner** | FastAPI + Python 3.14  | 6-stage security scanning pipeline  |
| **Database**         | PostgreSQL 17+         | Skills, versions, users, audit logs |
| **Object storage**   | RustFS (S3-compatible) | Skill tarballs                      |

## Docker Image Tags

| Tag           | Source               | Stability | Use Case                   |
| ------------- | -------------------- | --------- | -------------------------- |
| `latest`      | Latest `v*` tag      | Stable    | Production self-hosted     |
| `v0.8.1`      | Specific version     | Pinned    | Version-locked deployments |
| `nightly`     | Latest `main` branch | Unstable  | Testing upcoming features  |
| `sha-abc1234` | Specific commit      | Pinned    | Debugging specific builds  |

Images are published to `ghcr.io/tankpkg/`:

- `ghcr.io/tankpkg/tank-web` — Registry web app + API
- `ghcr.io/tankpkg/tank-scanner` — Security scanner (FastAPI)

## Deployment Modes

Tank uses `TANK_MODE` to separate cloud and self-hosted behavior:

| Mode            | Value             | Description                                                            |
| --------------- | ----------------- | ---------------------------------------------------------------------- |
| **Cloud**       | `cloud` (default) | Used for tankpkg.dev. Setup wizard disabled, all config from env vars. |
| **Self-Hosted** | `selfhosted`      | Enables setup wizard, automatic DB migrations, filesystem storage.     |

Docker Compose sets `TANK_MODE=selfhosted` automatically. If you deploy to Vercel or another PaaS, leave it unset (defaults to `cloud`).

## Prerequisites

- **Docker** and **Docker Compose** (for Docker deployment)
- **Helm 3+** and **kubectl** (for Kubernetes deployment)
- 4 GB RAM minimum (8 GB recommended for production)
- 20 GB disk (for database and storage)
- Node.js 24+ and Python 3.14+ (for source builds only)

## Docker Compose Deployment

### 1) Download and Configure

> **Quick install**: Run `bash scripts/onprem-install.sh` for an interactive guided setup that handles everything below automatically.

You don't need to clone the repository. Download the production compose file:

```bash
mkdir tank && cd tank
curl -fsSL https://raw.githubusercontent.com/tankpkg/tank/main/infra/docker-compose.production.yml -o docker-compose.yml
```

Create your `.env` file:

```bash
# Database
DATABASE_URL=postgresql://tank:password@postgres:5432/tank

# Auth
BETTER_AUTH_SECRET=$(openssl rand -base64 32)
APP_URL=https://tank.yourcompany.com
GITHUB_CLIENT_ID=your-github-oauth-app-id
GITHUB_CLIENT_SECRET=your-github-oauth-app-secret

# Storage (RustFS / S3)
STORAGE_BACKEND=s3
S3_ACCESS_KEY=tank
S3_SECRET_KEY=changeme123456
AWS_REGION=us-east-1
S3_BUCKET=tank-skills
S3_ENDPOINT=http://rustfs:9000

# Security scanner
PYTHON_API_URL=http://scanner:8000

# Admin bootstrap
FIRST_ADMIN_EMAIL=admin@yourcompany.com

```

### 2) Docker Compose Services

The `docker-compose.yml` defines four services (plus optional Ollama for local LLM analysis):

```yaml
version: "3.9"

services:
  postgres:
    image: postgres:17
    environment:
      POSTGRES_DB: tank
      POSTGRES_USER: tank
      POSTGRES_PASSWORD: password
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"

  rustfs:
    image: rustfs/rustfs:latest
    environment:
      RUSTFS_ACCESS_KEY: ${S3_ACCESS_KEY:-tank}
      RUSTFS_SECRET_KEY: ${S3_SECRET_KEY:-changeme123456}
      RUSTFS_VOLUMES: /data
      RUSTFS_ADDRESS: 0.0.0.0:9000
      RUSTFS_CONSOLE_ADDRESS: 0.0.0.0:9001
      RUSTFS_CONSOLE_ENABLE: "true"
    volumes:
      - rustfs_data:/data
    ports:
      - "9000:9000"
      - "9001:9001"

  scanner:
    image: ghcr.io/tankpkg/tank-scanner:latest
    environment:
      - DATABASE_URL=${DATABASE_URL}
    ports:
      - "8000:8000"
    depends_on:
      - postgres

  web:
    image: ghcr.io/tankpkg/tank-web:latest
    environment:
      - TANK_MODE=selfhosted
      - DATABASE_URL=${DATABASE_URL}
      - BETTER_AUTH_SECRET=${BETTER_AUTH_SECRET}
      - PYTHON_API_URL=${PYTHON_API_URL}
    ports:
      - "3000:3000"
    depends_on:
      - postgres
      - rustfs
      - scanner

volumes:
  postgres_data:
  rustfs_data:
```

**Optional: Local LLM analysis with Ollama**

```bash
# Start with LLM support (adds ollama service)
docker compose --profile llm-local up -d
```

### 3) Build and Run

```bash
# Start all services
docker compose up -d

# Check service health
docker compose ps

# View logs
docker compose logs -f web
docker compose logs -f scanner
```

### 4) Run Database Migrations

```bash
docker compose exec web bun --filter=@tankpkg/web drizzle-kit push
```

Or run as a one-shot migration container:

```bash
docker compose run --rm web bun --filter=@tankpkg/web drizzle-kit push
```

### 5) Bootstrap the Admin User

**Option A: Setup Wizard (recommended for first-time setup)**

Visit your registry URL — you'll be redirected to `/setup` automatically. The wizard walks through database verification, URL configuration, storage, admin account creation, auth providers, and scanner setup.

> The wizard is only available when `TANK_MODE=selfhosted`. After initial setup completes, the wizard is permanently locked (returns 403).

**Option B: Headless Bootstrap (for automated deployments)**

Set environment variables before starting:

```bash
FIRST_ADMIN_EMAIL=admin@yourcompany.com \
FIRST_ADMIN_PASSWORD=securepassword123 \
docker compose -f infra/docker-compose.yml up -d
```

Or bootstrap after startup:

```bash
docker compose exec registry bun run scripts/bootstrap-headless.ts
```

The bootstrap script:

- Creates the admin user with `emailVerified=true` and `role=admin`
- Idempotent — promotes existing user to admin if they already exist
- Uses bcrypt password hashing (compatible with Better Auth credential login)

### Setup Wizard (Recommended)

Instead of manually configuring environment variables, the setup wizard provides a guided 7-step process:

1. Visit `http://localhost:3000/setup`
2. Configure database, URL, storage, admin account, auth providers, and scanner
3. All settings are encrypted and stored in the database

The wizard is only available when `TANK_MODE=selfhosted` and no setup has been completed yet. After initial setup, the wizard is permanently locked (returns 403).

### 6) Health Verification

```bash
# API health check
curl http://localhost:3000/api/health

# Test skill listing
curl http://localhost:3000/api/v1/skills

# Test scanner connectivity
curl http://localhost:8000/health

# Verify CLI can connect
tank search hello
```

## Kubernetes Helm Chart Deployment

For production Kubernetes deployments, use the included Helm chart.

### Chart Location

```
infra/helm/tank/
├── Chart.yaml
├── values.yaml
└── templates/
    ├── web-deployment.yaml
    ├── scanner-deployment.yaml
    ├── ingress.yaml
    └── ...
```

### Chart Dependencies

The `infra/helm/tank/` chart includes:

| Dependency | Version | Purpose                      |
| ---------- | ------- | ---------------------------- |
| PostgreSQL | 15.5.38 | Primary database             |
| RustFS     | latest  | S3-compatible object storage |

### Quick Start

```bash
# Update Helm dependencies
helm dependency update infra/helm/tank/

# Install into the tank namespace
helm install tank infra/helm/tank/ \
  --namespace tank \
  --create-namespace \
  --set secrets.betterAuthSecret="$(openssl rand -base64 32)" \
  --set web.env.GITHUB_CLIENT_ID="your-client-id" \
  --set web.env.GITHUB_CLIENT_SECRET="your-client-secret" \
  --set web.env.FIRST_ADMIN_EMAIL="admin@yourcompany.com"
```

### Key Helm Values

```yaml
# values.yaml — key configuration options

web:
  replicaCount: 2
  image:
    repository: ghcr.io/tankpkg/tank-web
    tag: latest
  env:
    APP_URL: "https://tank.yourcompany.com"
    GITHUB_CLIENT_ID: ""
    GITHUB_CLIENT_SECRET: ""
    FIRST_ADMIN_EMAIL: ""

scanner:
  replicaCount: 1
  image:
    repository: ghcr.io/tankpkg/tank-scanner
    tag: latest
  resources:
    requests:
      memory: "512Mi"
      cpu: "250m"
    limits:
      memory: "2Gi"
      cpu: "1000m"

secrets:
  betterAuthSecret: "" # Required: openssl rand -base64 32

ingress:
  enabled: true
  className: "nginx"
  annotations:
    cert-manager.io/cluster-issuer: "letsencrypt-prod"
  hosts:
    - host: tank.yourcompany.com
      paths:
        - path: /
          pathType: Prefix
  tls:
    - secretName: tank-tls
      hosts:
        - tank.yourcompany.com

autoscaling:
  enabled: false
  minReplicas: 2
  maxReplicas: 10
  targetCPUUtilizationPercentage: 80

postgresql:
  enabled: true
  auth:
    database: tank
    username: tank
    password: "" # Set via --set or sealed secret

rustfs:
  enabled: true
  auth:
    accessKey: tank
    secretKey: "" # Set via --set or sealed secret
```

### Run Migrations on Helm Install

Enable the migration job in `values.yaml`:

```yaml
dbMigration:
  enabled: true
  force: false
```

Or force-run on first install:

```bash
helm install tank infra/helm/tank/ \
  --namespace tank \
  --create-namespace \
  --set dbMigration.force=true \
  --set secrets.betterAuthSecret="$(openssl rand -base64 32)"
```

### Upgrade

```bash
helm upgrade tank infra/helm/tank/ \
  --namespace tank \
  --reuse-values
```

## Environment Variables Reference

### Required

| Variable               | Description                           |
| ---------------------- | ------------------------------------- |
| `DATABASE_URL`         | PostgreSQL connection string          |
| `BETTER_AUTH_SECRET`   | Session encryption key (min 32 chars) |
| `GITHUB_CLIENT_ID`     | GitHub OAuth App client ID            |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth App client secret        |
| `PYTHON_API_URL`       | Security scanner base URL             |

### Self-Hosted Mode

| Variable               | Description                       | Default                   |
| ---------------------- | --------------------------------- | ------------------------- |
| `TANK_MODE`            | `cloud` or `selfhosted`           | `cloud`                   |
| `AUTO_MIGRATE`         | Run DB migrations on Docker start | `false`                   |
| `FIRST_ADMIN_EMAIL`    | Bootstrap admin on first boot     | —                         |
| `FIRST_ADMIN_PASSWORD` | Admin password (min 8 chars)      | —                         |
| `TANK_REGISTRY_URL`    | Override default registry URL     | `https://www.tankpkg.dev` |
| `SESSION_STORE`        | `memory` or `redis`               | `memory`                  |

### Storage

| Variable          | Description                       | Default              |
| ----------------- | --------------------------------- | -------------------- |
| `STORAGE_BACKEND` | `s3`, `supabase`, or `filesystem` | `supabase`           |
| `S3_BUCKET`       | Bucket name for tarballs          | —                    |
| `S3_ENDPOINT`     | S3 endpoint (for RustFS)          | —                    |
| `S3_ACCESS_KEY`   | S3 access key                     | —                    |
| `S3_SECRET_KEY`   | S3 secret key                     | —                    |
| `S3_REGION`       | S3 region                         | `us-east-1`          |
| `STORAGE_FS_PATH` | Local path for filesystem storage | `/app/data/packages` |

### Optional

| Variable             | Description                        | Default |
| -------------------- | ---------------------------------- | ------- |
| `FIRST_ADMIN_EMAIL`  | Bootstraps admin role on first run | —       |
| `OIDC_ISSUER`        | OIDC SSO issuer URL                | —       |
| `OIDC_CLIENT_ID`     | OIDC client ID                     | —       |
| `OIDC_CLIENT_SECRET` | OIDC client secret                 | —       |
| `RESEND_API_KEY`     | Resend email service key           | —       |

## Operational Notes

- **Scanner**: Security scanner code lives in `apps/python-api/`.
- **Turbo builds**: Use `bun turbo build --filter=@tankpkg/web...` for dependency-aware monorepo builds.
- **Auth secret**: Never omit `BETTER_AUTH_SECRET` in production. Sessions fail silently without it.
- **Storage backend**: Supabase is for cloud deployments. Use `s3` with RustFS for self-hosted.

## Monitoring

Access the included observability stack (Docker Compose only):

- **Grafana**: `http://localhost:3001` (default: admin/admin)
- **Loki**: Log aggregation (configured in `infra/loki/`)
- **Prometheus**: Metrics collection

Default dashboards include:

- Tank API performance
- Security scan latency and throughput
- Skill publish and download rates
- Active user sessions

## Troubleshooting

### Build fails with workspace package resolution

Use the monorepo-aware build command:

```bash
bun turbo build --filter=@tankpkg/web...
```

### Auth runtime errors

Ensure `BETTER_AUTH_SECRET` is explicitly set in your deployment environment. It must be identical across all web replicas.

### Scanner connectivity errors

Verify `PYTHON_API_URL` points to the scanner service. In Docker Compose, use the service name (`http://scanner:8000`). Check scanner health:

```bash
curl $PYTHON_API_URL/health
```

### RustFS bucket not found

RustFS auto-creates buckets on first write. If you need to create one manually:

```bash
docker compose exec rustfs mc alias set local http://localhost:9000 tank changeme123456
docker compose exec rustfs mc mb local/tank-skills
```

### Helm chart: pods stuck in `Pending`

Check resource requests against available node capacity:

```bash
kubectl describe pod -n tank -l app=tank-web
kubectl get nodes -o wide
```

Adjust `resources.requests` in `values.yaml` if needed.
