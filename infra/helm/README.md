# Tank — On-Premises Deployment

This directory contains the Helm chart for deploying Tank on Kubernetes. For Docker Compose deployments, see [Docker Compose Deployment](#docker-compose-deployment) below.

## Contents

- [Overview](#overview)
- [Docker Compose Deployment](#docker-compose-deployment)
- [Kubernetes / Helm Deployment](#kubernetes--helm-deployment)
- [Configuration Reference](#configuration-reference)
- [Operations](#operations)

---

## Overview

Tank deploys five core services and one optional service:

| Service               | Image                | Purpose                                             |
| --------------------- | -------------------- | --------------------------------------------------- |
| `web`                 | `tank-web`           | Next.js 15 registry, API, and admin UI              |
| `scanner`             | `tank-scanner`       | Python FastAPI — 6-stage security analysis pipeline |
| `postgres`            | `postgres:17-alpine` | Primary data store (Drizzle ORM)                    |
| `redis`               | `redis:7-alpine`     | Session store and cache                             |
| `minio`               | `minio/minio`        | S3-compatible object storage for skill tarballs     |
| `ollama` _(optional)_ | `ollama/ollama`      | Local LLM for air-gapped security scanning          |

### Architecture

```
                        ┌─────────────────────────────────────────┐
                        │              Tank Cluster                │
                        │                                         │
  Users / CLI ─────────►│  Ingress / LoadBalancer                 │
                        │       │                                 │
                        │       ▼                                 │
                        │  ┌─────────┐     ┌──────────────────┐  │
                        │  │   web   │────►│     scanner      │  │
                        │  │ :3000   │     │  (FastAPI :8000) │  │
                        │  └────┬────┘     └────────┬─────────┘  │
                        │       │                   │             │
                        │  ┌────▼────┐         ┌───▼────┐        │
                        │  │postgres │         │ ollama │        │
                        │  │  :5432  │         │ :11434 │        │
                        │  └─────────┘         │(opt.)  │        │
                        │                      └────────┘        │
                        │  ┌─────────┐  ┌──────────────────┐    │
                        │  │  redis  │  │      minio       │    │
                        │  │  :6379  │  │  :9000 / :9001   │    │
                        │  └─────────┘  └──────────────────┘    │
                        └─────────────────────────────────────────┘
```

The `web` service is the only externally-exposed component. All other services communicate over the internal cluster network.

### Prerequisites

**Docker Compose:**

- Docker Engine 24+ with Compose v2
- 4 GB RAM, 20 GB disk (minimum)

**Kubernetes / Helm:**

- Helm 3.12+
- kubectl configured against a running cluster
- Kubernetes 1.27+ (tested on 1.28–1.32)
- A default StorageClass for persistent volumes
- Optionally: Kind or Minikube for local development

---

## Docker Compose Deployment

Docker Compose is the fastest path to a running Tank instance. All services start with a single command.

### 1. Configure environment

```bash
cp .env.example .env
```

Open `.env` and fill in the required values. At minimum, set `BETTER_AUTH_SECRET`:

```bash
# Generate a secure secret
openssl rand -base64 32
```

Paste the output as the value of `BETTER_AUTH_SECRET` in `.env`. This value signs all session tokens — treat it like a private key.

The remaining defaults work out of the box for a local deployment. Review the full variable list in [Environment Variables](#environment-variables).

### 2. Start services

```bash
docker compose up -d
```

This starts postgres, redis, minio, scanner, and web. All services have health checks; the web container will not start until its dependencies are healthy.

To include the optional local LLM (Ollama):

```bash
docker compose --profile llm-local up -d
```

### 3. First-run setup

Run the initialization script after the stack is up:

```bash
./scripts/onprem/first-run.sh
```

This script:

1. Validates your configuration
2. Waits for all services to report healthy
3. Runs database migrations
4. Creates the MinIO storage bucket
5. Verifies the stack with a health check

### 4. Bootstrap the first admin

Set `FIRST_ADMIN_EMAIL` in `.env` to your email address, then run:

```bash
docker compose exec web node -e "
  const { bootstrapAdmin } = require('./dist/lib/admin.js');
  bootstrapAdmin(process.env.FIRST_ADMIN_EMAIL);
"
```

Or use the npm script if running outside Docker:

```bash
just db-admin
```

### 5. Smoke test

```bash
curl -sf http://localhost:3000/api/health
```

Expected response: `{"status":"ok"}`

Check all container statuses:

```bash
docker compose ps
```

All services should show `healthy` or `running`.

### Troubleshooting

**Port conflict on 3000 or 9001**

Set `APP_PORT` or `MINIO_CONSOLE_PORT` in `.env`:

```bash
APP_PORT=3001 docker compose up -d
```

**Web container exits immediately**

`BETTER_AUTH_SECRET` is required and has no default. Confirm it is set:

```bash
docker compose config | grep BETTER_AUTH_SECRET
```

**Health check failures**

Inspect logs for the failing service:

```bash
docker compose logs postgres --tail=50
docker compose logs scanner --tail=50
```

PostgreSQL typically fails if `POSTGRES_PASSWORD` contains special characters that need shell escaping. Wrap the value in single quotes in `.env`.

**Scanner cannot reach the database**

The scanner depends on postgres being healthy. If postgres takes longer than expected to initialize (e.g., on slow disk), increase the health check retries in `infra/docker-compose.yml` or wait and restart:

```bash
docker compose restart scanner
```

---

## Kubernetes / Helm Deployment

### Prerequisites

- Helm 3.12+ (`helm version`)
- kubectl with cluster access (`kubectl cluster-info`)
- A default StorageClass (`kubectl get storageclass`)

### Quick start

Fetch subchart dependencies (Bitnami PostgreSQL, Redis; MinIO):

```bash
helm dependency update infra/helm/tank/
```

Install into a dedicated namespace:

```bash
helm install tank infra/helm/tank/ \
  --namespace tank \
  --create-namespace \
  --set secrets.betterAuthSecret="$(openssl rand -base64 32)" \
  --set dbMigration.force=true
```

> **Note:** `--set dbMigration.force=true` is needed for initial installs to create the schema. On subsequent upgrades, omit it to review migrations before applying destructive changes.
>
> Pass `secrets.betterAuthSecret` on the command line or via an existing Kubernetes Secret (see [Using existing secrets](#using-existing-kubernetes-secrets)). Never commit a real secret into `values.yaml`.

Check rollout status:

```bash
kubectl rollout status deployment/tank-web -n tank
kubectl get pods -n tank
```

The NOTES output after install prints the command to access the web UI.

### Local development (Kind / Minikube)

A pre-configured overlay is provided for local clusters with reduced resource requests:

```bash
helm install tank infra/helm/tank/ \
  --namespace tank \
  --create-namespace \
  -f infra/helm/tank/values-local.yaml \
  --set secrets.betterAuthSecret="$(openssl rand -base64 32)" \
  --set dbMigration.force=true
```

### Custom values

#### Using external PostgreSQL

Disable the subchart and point Tank at your existing database:

```yaml
# values-external-pg.yaml
postgresql:
  enabled: false

global:
  postgresql:
    externalHost: "my-postgres.example.com"
    auth:
      username: tank
      password: "" # use existingSecret in production
      database: tank
```

```bash
helm upgrade tank infra/helm/tank/ -f values-external-pg.yaml
```

#### Using external Redis

```yaml
# values-external-redis.yaml
redis:
  enabled: false

global:
  redis:
    externalHost: "my-redis.example.com"
    auth:
      password: "" # use existingSecret in production
```

#### Configuring ingress with TLS

```yaml
# values-ingress.yaml
ingress:
  enabled: true
  className: nginx
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
  hosts:
    - host: tank.example.com
      paths:
        - path: /
          pathType: Prefix
  tls:
    - secretName: tank-tls
      hosts:
        - tank.example.com

web:
  betterAuthUrl: "https://tank.example.com"
  nextPublicAppUrl: "https://tank.example.com"
```

#### Enabling Ollama for air-gapped LLM scanning

```yaml
# values-ollama.yaml
ollama:
  enabled: true
  persistence:
    size: 40Gi # size depends on model(s) pulled
  resources:
    requests:
      memory: 4Gi
    limits:
      memory: 16Gi
```

After deploying, pull a model into the Ollama pod:

```bash
kubectl exec -n tank deployment/tank-ollama -- ollama pull llama3.2
```

Then configure the scanner to use it by setting `LLM_BASE_URL` to `http://tank-ollama:11434/v1` via an existing secret or values override.

#### Using existing Kubernetes secrets

Create a Secret with all required keys before installing:

```bash
kubectl create secret generic tank-secrets \
  --namespace tank \
  --from-literal=BETTER_AUTH_SECRET="$(openssl rand -base64 32)" \
  --from-literal=GITHUB_CLIENT_SECRET="<your-github-secret>" \
  --from-literal=POSTGRES_PASSWORD="<your-db-password>"
```

Reference it in values:

```yaml
secrets:
  existingSecret: tank-secrets
```

When `existingSecret` is set, the chart does not create its own Secret resource. All pods mount the referenced secret via `envFrom`.

For automated secret rotation, use the [External Secrets Operator](https://external-secrets.io/) to sync from AWS Secrets Manager, HashiCorp Vault, or GCP Secret Manager.

### Production hardening checklist

Before exposing Tank to production traffic:

- [ ] **Generate a real `BETTER_AUTH_SECRET`** — `openssl rand -base64 32`. Never use the default placeholder.
- [ ] **Use `existingSecret` or External Secrets Operator** — do not store secrets in `values.yaml` or Helm release history.
- [ ] **Enable resource limits** — defaults are set; review and adjust for your workload.
- [ ] **Configure ingress with cert-manager** — terminate TLS at the ingress layer.
- [ ] **Set `web.betterAuthUrl` and `web.nextPublicAppUrl`** to your public HTTPS URL.
- [ ] **Enable persistent storage** — all subcharts default to `persistence.enabled: true`; confirm your StorageClass supports `ReadWriteOnce`.
- [ ] **Enable HPA** — set `autoscaling.enabled: true` and tune `minReplicas` / `maxReplicas` for your traffic profile.
- [ ] **Enable Redis auth** — set `redis.auth.enabled: true` and provide a password via `existingSecret`.
- [ ] **Restrict MinIO access** — do not expose the MinIO console (`consoleIngress.enabled: false`) unless required.
- [ ] **Set `FIRST_ADMIN_EMAIL`** — bootstrap the first admin account immediately after install.
- [ ] **Review scanner LLM configuration** — without an LLM key, the scanner operates in regex-only mode (still effective, but with higher false-positive rates).

---

## Configuration Reference

### values.yaml keys

#### Global

| Key                               | Default      | Description                                                |
| --------------------------------- | ------------ | ---------------------------------------------------------- |
| `nameOverride`                    | `""`         | Override the chart name                                    |
| `fullnameOverride`                | `""`         | Override the full release name                             |
| `global.postgresql.auth.username` | `tank`       | PostgreSQL username                                        |
| `global.postgresql.auth.password` | `tank`       | PostgreSQL password (use `existingSecret` in production)   |
| `global.postgresql.auth.database` | `tank`       | PostgreSQL database name                                   |
| `global.postgresql.port`          | `5432`       | PostgreSQL port                                            |
| `global.postgresql.externalHost`  | `""`         | External PostgreSQL host (when `postgresql.enabled=false`) |
| `global.redis.auth.password`      | `""`         | Redis password (empty = no auth)                           |
| `global.redis.port`               | `6379`       | Redis port                                                 |
| `global.redis.externalHost`       | `""`         | External Redis host (when `redis.enabled=false`)           |
| `global.storage.backend`          | `s3`         | Storage backend: `s3` or `supabase`                        |
| `global.storage.s3.endpoint`      | `""`         | S3 endpoint URL (auto-set from MinIO subchart)             |
| `global.storage.s3.accessKey`     | `tank`       | S3 access key                                              |
| `global.storage.s3.secretKey`     | `tank123456` | S3 secret key (use `existingSecret` in production)         |
| `global.storage.s3.bucket`        | `packages`   | S3 bucket name for skill tarballs                          |
| `global.storage.s3.region`        | `us-east-1`  | S3 region                                                  |

#### Service Account

| Key                          | Default | Description                                        |
| ---------------------------- | ------- | -------------------------------------------------- |
| `serviceAccount.create`      | `true`  | Create a Kubernetes ServiceAccount                 |
| `serviceAccount.annotations` | `{}`    | Annotations on the ServiceAccount (e.g., for IRSA) |
| `serviceAccount.name`        | `""`    | ServiceAccount name (auto-generated if empty)      |

#### Secrets

| Key                          | Default        | Description                                               |
| ---------------------------- | -------------- | --------------------------------------------------------- |
| `secrets.existingSecret`     | `""`           | Name of an existing Secret to use instead of creating one |
| `secrets.betterAuthSecret`   | `changeme-...` | Session signing secret — **must be changed**              |
| `secrets.githubClientSecret` | `""`           | GitHub OAuth client secret                                |
| `secrets.oidcClientSecret`   | `""`           | OIDC SSO client secret                                    |
| `secrets.resendApiKey`       | `""`           | Resend API key for transactional email                    |
| `secrets.llmApiKey`          | `""`           | Custom OpenAI-compatible LLM API key                      |
| `secrets.groqApiKey`         | `""`           | Groq API key (free LLM scanning)                          |
| `secrets.openrouterApiKey`   | `""`           | OpenRouter API key (free LLM scanning fallback)           |

#### Web Application

| Key                             | Default                 | Description                                               |
| ------------------------------- | ----------------------- | --------------------------------------------------------- |
| `web.replicaCount`              | `2`                     | Number of web replicas                                    |
| `web.image.repository`          | `tank-web`              | Container image repository                                |
| `web.image.tag`                 | `""`                    | Image tag (defaults to `Chart.appVersion`)                |
| `web.image.pullPolicy`          | `IfNotPresent`          | Image pull policy                                         |
| `web.imagePullSecrets`          | `[]`                    | Image pull secrets for private registries                 |
| `web.service.type`              | `ClusterIP`             | Kubernetes Service type                                   |
| `web.service.port`              | `3000`                  | Service port                                              |
| `web.resources.requests.cpu`    | `250m`                  | CPU request                                               |
| `web.resources.requests.memory` | `512Mi`                 | Memory request                                            |
| `web.resources.limits.cpu`      | `1`                     | CPU limit                                                 |
| `web.resources.limits.memory`   | `1Gi`                   | Memory limit                                              |
| `web.betterAuthUrl`             | `http://localhost:3000` | Public-facing URL for better-auth (set to your HTTPS URL) |
| `web.authProviders`             | `credentials`           | Enabled auth providers: `credentials`, `github`, `oidc`   |
| `web.nextPublicAuthProviders`   | `credentials`           | Auth providers exposed to the browser                     |
| `web.githubClientId`            | `""`                    | GitHub OAuth client ID                                    |
| `web.oidc.issuerUrl`            | `""`                    | OIDC issuer URL                                           |
| `web.oidc.providerId`           | `enterprise-oidc`       | OIDC provider ID                                          |
| `web.oidc.discoveryUrl`         | `""`                    | OIDC discovery URL                                        |
| `web.oidc.clientId`             | `""`                    | OIDC client ID                                            |
| `web.oidc.authorizationUrl`     | `""`                    | OIDC authorization endpoint                               |
| `web.oidc.tokenUrl`             | `""`                    | OIDC token endpoint                                       |
| `web.oidc.userInfoUrl`          | `""`                    | OIDC userinfo endpoint                                    |
| `web.sessionStore`              | `redis`                 | Session store: `redis` or `memory`                        |
| `web.nextPublicAppUrl`          | `http://localhost:3000` | Public app URL (`NEXT_PUBLIC_APP_URL`)                    |
| `web.emailFrom`                 | `no-reply@tank.local`   | Email sender address                                      |
| `web.firstAdminEmail`           | `""`                    | Email to bootstrap as first admin                         |
| `web.nodeEnv`                   | `production`            | Node.js environment                                       |
| `web.podAnnotations`            | `{}`                    | Pod annotations                                           |
| `web.nodeSelector`              | `{}`                    | Node selector                                             |
| `web.tolerations`               | `[]`                    | Pod tolerations                                           |
| `web.affinity`                  | `{}`                    | Pod affinity rules                                        |

#### Ingress

| Key                              | Default      | Description                                     |
| -------------------------------- | ------------ | ----------------------------------------------- |
| `ingress.enabled`                | `false`      | Enable Ingress resource                         |
| `ingress.className`              | `""`         | Ingress class (e.g., `nginx`, `traefik`)        |
| `ingress.annotations`            | `{}`         | Ingress annotations (e.g., cert-manager issuer) |
| `ingress.hosts[0].host`          | `tank.local` | Hostname                                        |
| `ingress.hosts[0].paths[0].path` | `/`          | Path prefix                                     |
| `ingress.tls`                    | `[]`         | TLS configuration                               |

#### Autoscaling

| Key                                          | Default | Description                       |
| -------------------------------------------- | ------- | --------------------------------- |
| `autoscaling.enabled`                        | `false` | Enable HPA for the web deployment |
| `autoscaling.minReplicas`                    | `2`     | Minimum replicas                  |
| `autoscaling.maxReplicas`                    | `10`    | Maximum replicas                  |
| `autoscaling.targetCPUUtilizationPercentage` | `75`    | Target CPU utilization            |

#### Scanner

| Key                                 | Default        | Description                                      |
| ----------------------------------- | -------------- | ------------------------------------------------ |
| `scanner.replicaCount`              | `1`            | Number of scanner replicas                       |
| `scanner.image.repository`          | `tank-scanner` | Container image repository                       |
| `scanner.image.tag`                 | `""`           | Image tag (defaults to `Chart.appVersion`)       |
| `scanner.resources.requests.cpu`    | `250m`         | CPU request                                      |
| `scanner.resources.requests.memory` | `256Mi`        | Memory request                                   |
| `scanner.resources.limits.cpu`      | `1`            | CPU limit                                        |
| `scanner.resources.limits.memory`   | `1Gi`          | Memory limit                                     |
| `scanner.llmBaseUrl`                | `""`           | Custom LLM provider base URL (OpenAI-compatible) |
| `scanner.llmModel`                  | `""`           | Custom LLM model name                            |
| `scanner.llmScanTimeoutMs`          | `8000`         | LLM call timeout in milliseconds                 |
| `scanner.groq8bModel`               | `""`           | Override default Groq 8B model                   |
| `scanner.groq70bModel`              | `""`           | Override default Groq 70B model                  |
| `scanner.openrouterModel`           | `""`           | Override default OpenRouter model                |

#### Ollama (optional)

| Key                                | Default         | Description                             |
| ---------------------------------- | --------------- | --------------------------------------- |
| `ollama.enabled`                   | `false`         | Enable Ollama deployment                |
| `ollama.image.repository`          | `ollama/ollama` | Container image                         |
| `ollama.image.tag`                 | `latest`        | Image tag                               |
| `ollama.replicaCount`              | `1`             | Number of replicas                      |
| `ollama.service.port`              | `11434`         | Service port                            |
| `ollama.resources.requests.memory` | `2Gi`           | Memory request                          |
| `ollama.resources.limits.memory`   | `8Gi`           | Memory limit                            |
| `ollama.persistence.enabled`       | `true`          | Enable persistent storage for models    |
| `ollama.persistence.size`          | `20Gi`          | Volume size                             |
| `ollama.persistence.storageClass`  | `""`            | Storage class (empty = cluster default) |

#### Database Migration Job

| Key                                     | Default | Description                                                                                                                             |
| --------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `dbMigration.enabled`                   | `true`  | Run DB migrations as a post-install/post-upgrade Helm hook                                                                              |
| `dbMigration.force`                     | `false` | Pass `--force` to `drizzle-kit push` (skips confirmation for destructive DDL). Use `--set dbMigration.force=true` for initial installs. |
| `dbMigration.resources.requests.cpu`    | `100m`  | CPU request                                                                                                                             |
| `dbMigration.resources.requests.memory` | `256Mi` | Memory request                                                                                                                          |

#### MinIO Init Job

| Key                          | Default    | Description                             |
| ---------------------------- | ---------- | --------------------------------------- |
| `minioInit.enabled`          | `true`     | Create the storage bucket after install |
| `minioInit.image.repository` | `minio/mc` | MinIO client image                      |
| `minioInit.image.tag`        | `latest`   | Image tag                               |

#### PostgreSQL Subchart

| Key                                   | Default | Description                            |
| ------------------------------------- | ------- | -------------------------------------- |
| `postgresql.enabled`                  | `true`  | Deploy PostgreSQL via Bitnami subchart |
| `postgresql.auth.username`            | `tank`  | Database username                      |
| `postgresql.auth.password`            | `tank`  | Database password                      |
| `postgresql.auth.database`            | `tank`  | Database name                          |
| `postgresql.primary.persistence.size` | `10Gi`  | PVC size                               |

#### Redis Subchart

| Key                             | Default      | Description                       |
| ------------------------------- | ------------ | --------------------------------- |
| `redis.enabled`                 | `true`       | Deploy Redis via Bitnami subchart |
| `redis.architecture`            | `standalone` | Redis architecture                |
| `redis.auth.enabled`            | `false`      | Enable Redis authentication       |
| `redis.master.persistence.size` | `2Gi`        | PVC size                          |

#### MinIO Subchart

| Key                            | Default      | Description                      |
| ------------------------------ | ------------ | -------------------------------- |
| `minio.enabled`                | `true`       | Deploy MinIO via subchart        |
| `minio.mode`                   | `standalone` | MinIO mode                       |
| `minio.rootUser`               | `tank`       | MinIO root user                  |
| `minio.rootPassword`           | `tank123456` | MinIO root password              |
| `minio.persistence.size`       | `10Gi`       | PVC size                         |
| `minio.consoleIngress.enabled` | `false`      | Expose MinIO console via Ingress |

### Environment variables

These variables are set on the `web` container. When using `secrets.existingSecret`, your Secret must contain the keys marked **required**.

| Variable               | Required | Description                                                         |
| ---------------------- | -------- | ------------------------------------------------------------------- |
| `DATABASE_URL`         | Yes      | PostgreSQL connection string (constructed from `global.postgresql`) |
| `BETTER_AUTH_SECRET`   | Yes      | Session signing secret                                              |
| `BETTER_AUTH_URL`      | Yes      | Public-facing URL of the web app                                    |
| `AUTH_PROVIDERS`       | No       | Comma-separated list: `credentials`, `github`, `oidc`               |
| `GITHUB_CLIENT_ID`     | No       | GitHub OAuth client ID                                              |
| `GITHUB_CLIENT_SECRET` | No       | GitHub OAuth client secret                                          |
| `OIDC_ISSUER_URL`      | No       | OIDC issuer URL                                                     |
| `OIDC_CLIENT_ID`       | No       | OIDC client ID                                                      |
| `OIDC_CLIENT_SECRET`   | No       | OIDC client secret                                                  |
| `STORAGE_BACKEND`      | No       | `s3` (default) or `supabase`                                        |
| `S3_ENDPOINT`          | No       | S3/MinIO endpoint URL                                               |
| `S3_ACCESS_KEY`        | No       | S3 access key                                                       |
| `S3_SECRET_KEY`        | No       | S3 secret key                                                       |
| `S3_BUCKET`            | No       | S3 bucket name (default: `packages`)                                |
| `REDIS_URL`            | No       | Redis connection URL                                                |
| `SESSION_STORE`        | No       | `redis` (default) or `memory`                                       |
| `PYTHON_API_URL`       | No       | Internal URL of the scanner service                                 |
| `RESEND_API_KEY`       | No       | Resend API key for transactional email                              |
| `EMAIL_FROM`           | No       | Email sender address                                                |
| `FIRST_ADMIN_EMAIL`    | No       | Email to promote to admin on first boot                             |
| `LLM_API_KEY`          | No       | Custom OpenAI-compatible LLM API key                                |
| `LLM_BASE_URL`         | No       | Custom LLM provider base URL                                        |
| `LLM_MODEL`            | No       | Custom LLM model name                                               |
| `GROQ_API_KEY`         | No       | Groq API key (free LLM scanning)                                    |
| `OPENROUTER_API_KEY`   | No       | OpenRouter API key (free LLM scanning fallback)                     |
| `LLM_SCAN_TIMEOUT_MS`  | No       | LLM call timeout in ms (default: `8000`)                            |

---

## Operations

### Upgrading

Pull the latest chart changes, then upgrade in place:

```bash
helm dependency update infra/helm/tank/
helm upgrade tank infra/helm/tank/ --namespace tank
```

The `dbMigration` Helm hook runs automatically as a post-upgrade job, applying any pending schema migrations before the new pods start.

To preview changes before applying:

```bash
helm diff upgrade tank infra/helm/tank/ --namespace tank
```

(Requires the `helm-diff` plugin: `helm plugin install https://github.com/databus23/helm-diff`)

### Backup

The `scripts/onprem/backup-all.sh` script backs up both the PostgreSQL database and MinIO object storage:

```bash
BACKUP_DIR=/backups/tank_$(date +%Y%m%d) \
POSTGRES_PASSWORD=<your-password> \
S3_ACCESS_KEY=<your-access-key> \
S3_SECRET_KEY=<your-secret-key> \
./scripts/onprem/backup-all.sh
```

This produces:

- `database.sql` — full `pg_dump` of the Tank database
- `minio-packages/` — mirror of the skill tarball bucket
- `infra/docker-compose.yml` and `.env.example` — configuration templates

**Restore database:**

```bash
cat /backups/tank_YYYYMMDD/database.sql | \
  docker exec -i tank-postgres psql -U tank tank
```

**Restore object storage:**

```bash
mc mirror /backups/tank_YYYYMMDD/minio-packages tank-minio/packages
```

For Kubernetes deployments, run the backup script from a pod with access to both services, or use a CronJob that mounts the same credentials.

### Monitoring

Tank emits structured JSON logs from both the web app and scanner. The `infra/` directory contains ready-to-use configurations for Loki and Grafana:

```
infra/
├── loki-config.yaml    # Loki log aggregation configuration
└── grafana/            # Grafana dashboards and datasource configs
```

To enable debug logging on the web app, set `TANK_DEBUG=1` in the container environment. Debug logs are routed through `pino` and include request traces, scanner call durations, and auth events.

**Key health endpoints:**

| Endpoint          | Service         | Expected response |
| ----------------- | --------------- | ----------------- |
| `GET /api/health` | web (:3000)     | `{"status":"ok"}` |
| `GET /health`     | scanner (:8000) | `{"status":"ok"}` |

### Troubleshooting

**Pods stuck in `Pending`**

Usually a PVC binding issue. Check StorageClass availability:

```bash
kubectl get storageclass
kubectl describe pvc -n tank
```

**Web pod `CrashLoopBackOff`**

Inspect logs and events:

```bash
kubectl logs -n tank deployment/tank-web --previous
kubectl describe pod -n tank -l app.kubernetes.io/component=web
```

The most common cause is a missing or malformed `BETTER_AUTH_SECRET`. Confirm the secret is mounted correctly:

```bash
kubectl exec -n tank deployment/tank-web -- env | grep BETTER_AUTH_SECRET
```

**Database migration job fails**

Check the job logs:

```bash
kubectl logs -n tank job/tank-db-migration
```

If the job completed but left a failed status, delete it before the next upgrade:

```bash
kubectl delete job -n tank tank-db-migration
```

**Scanner not processing submissions**

Verify the scanner is reachable from the web pod:

```bash
kubectl exec -n tank deployment/tank-web -- \
  curl -sf http://tank-scanner:8000/health
```

If the scanner is unreachable, check its pod status and logs:

```bash
kubectl logs -n tank deployment/tank-scanner
```

**MinIO bucket does not exist**

The `minioInit` job creates the bucket on install. If it failed, run it manually:

```bash
kubectl logs -n tank job/tank-minio-init
```

Or create the bucket directly via the MinIO client:

```bash
kubectl exec -n tank deployment/tank-minio -- \
  mc mb local/packages --ignore-existing
```

**Helm release stuck in `pending-upgrade`**

A previous upgrade may have left a failed hook job. Clean it up:

```bash
kubectl delete job -n tank -l "helm.sh/chart=tank"
helm rollback tank -n tank
```
