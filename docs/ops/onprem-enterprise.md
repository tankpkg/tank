# Tank On-Prem Enterprise Deployment

## Architecture (Self-Hosted)

```text
                    +-------------------+
                    |   Enterprise IdP  |
                    | (Okta / Azure AD) |
                    +---------+---------+
                              |
                              | OIDC
                              v
+-----------------------------+------------------------------+
|                          Tank Web                          |
|                  (Next.js + Better Auth)                  |
+-----------+----------------+----------------+-------------+
            |                |                |
            | SQL            | sessions       | signed URLs
            v                v                v
     +------+-------+   +----+----+    +-----+------+
     |  PostgreSQL  |   | Redis  |    | MinIO / S3 |
     +--------------+   +---------+    +------------+
            |
            | version metadata + scan results
            v
     +------+---------------------+
     | Python Security Scanner    |
     | (FastAPI, 6-stage pipeline)|
     +----------------------------+
```

## Quick Start

1. Copy `.env.example.onprem` to `.env` and fill required values.
2. Start stack:

```bash
docker compose up -d --build
```

3. Initialize database schema:

```bash
DATABASE_URL="postgresql://tank:...@localhost:5432/tank" ./scripts/onprem/init-db.sh
```

4. Verify deployment:

```bash
./scripts/onprem/smoke-test.sh
```

## Auth Modes

- `credentials`: Email/password login (with verification flow).
- `github`: GitHub OAuth login.
- `oidc`: Enterprise OIDC SSO via external IdP.

Set via `AUTH_PROVIDERS` and `NEXT_PUBLIC_AUTH_PROVIDERS` (comma-separated).

### OIDC Configuration

Use one of:

- Discovery URL (`OIDC_DISCOVERY_URL`) preferred.
- Manual endpoints (`OIDC_AUTHORIZATION_URL`, `OIDC_TOKEN_URL`, `OIDC_USER_INFO_URL`).

Required:

- `OIDC_CLIENT_ID`
- `OIDC_CLIENT_SECRET`
- `OIDC_PROVIDER_ID` (default `enterprise-oidc`)

## Migration Strategy

This repo does not auto-run DB migrations on app startup.

- Generate migration during development: `cd apps/registry-legacy && bunx drizzle-kit generate`
- Apply schema for deployment/init: `cd apps/registry-legacy && bunx drizzle-kit push --force`

## Enterprise Security Checklist

- Use strong values for `BETTER_AUTH_SECRET`, DB, Redis, and MinIO credentials.
- Place services on private network segments; expose only the web app.
- Enable TLS termination at ingress/load balancer.
- Store secrets in a secrets manager (Vault, Kubernetes secrets, Docker secrets).
- Rotate API keys and OAuth client secrets regularly.
- Restrict outbound internet access from scanner where possible.
- Snapshot/backup PostgreSQL and object storage regularly.

## Current Scope and Gap

- Implemented: single-tenant env-driven OIDC SSO.
- Not yet implemented: per-organization IdP config UI (multi-tenant SSO admin experience).
