# Tank On-Prem Operations Runbooks

## Table of Contents

1. [Secrets Management](#secrets-management)
2. [Backup and Restore](#backup-and-restore)
3. [TLS/HTTPS Configuration](#tlshttps-configuration)
4. [Health Monitoring](#health-monitoring)
5. [Troubleshooting](#troubleshooting)

---

## Secrets Management

### Production Requirements

**Never** commit secrets to version control or use plaintext values in `docker-compose.yml` for production.

### Option 1: Docker Secrets (Swarm)

```yaml
# docker-compose.prod.yml
services:
  web:
    secrets:
      - better_auth_secret
      - oidc_client_secret
    environment:
      BETTER_AUTH_SECRET_FILE: /run/secrets/better_auth_secret
      OIDC_CLIENT_SECRET_FILE: /run/secrets/oidc_client_secret

secrets:
  better_auth_secret:
    external: true
  oidc_client_secret:
    external: true
```

Create secrets:

```bash
echo "your-secret-here" | docker secret create better_auth_secret -
```

### Option 2: HashiCorp Vault

Use Vault's Docker integration or agent:

```yaml
services:
  vault-agent:
    image: vault:1.15
    # ... vault agent config to write secrets to shared volume
```

### Option 3: Environment Files

Use `.env` files with restricted permissions:

```bash
# Generate .env with strong secrets
chmod 600 .env
# Never commit .env to git
```

### Option 4: Kubernetes Secrets

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: tank-secrets
type: Opaque
stringData:
  BETTER_AUTH_SECRET: "your-secret-here"
  OIDC_CLIENT_SECRET: "your-oidc-secret"
```

### Secret Rotation

1. Generate new secret: `openssl rand -base64 32`
2. Update in secrets manager
3. Restart affected services: `docker compose restart web`
4. Verify auth flows still work
5. Revoke old credentials in IdP if applicable

---

## Backup and Restore

### PostgreSQL Backup

#### Manual Backup

```bash
# From host with psql installed
docker exec tank-postgres pg_dump -U tank tank > backup_$(date +%Y%m%d_%H%M%S).sql

# Or use pg_dumpall for entire cluster
docker exec tank-postgres pg_dumpall -U tank > cluster_backup_$(date +%Y%m%d).sql
```

#### Automated Daily Backups

```yaml
# Add to docker-compose.yml
backup:
  image: postgres:17-alpine
  container_name: tank-backup
  environment:
    PGPASSWORD: ${POSTGRES_PASSWORD}
  volumes:
    - ./backups:/backups
  entrypoint: |
    sh -c 'while true; do
      pg_dump -h postgres -U tank tank > /backups/backup_$$(date +%Y%m%d_%H%M%S).sql
      find /backups -name "backup_*.sql" -mtime +7 -delete
      sleep 86400
    done'
  depends_on:
    - postgres
  networks:
    - tank-network
```

### PostgreSQL Restore

```bash
# Stop web app to prevent writes
docker compose stop web scanner

# Restore from backup
cat backup_20240115_120000.sql | docker exec -i tank-postgres psql -U tank tank

# Restart services
docker compose start web scanner
```

### MinIO Object Storage Backup

#### Manual Backup (mc mirror)

```bash
# Configure mc client
mc alias set tank-minio http://localhost:9000 tank your-password

# Mirror bucket to local directory
mc mirror tank-minio/packages ./minio-backup/packages_$(date +%Y%m%d)

# Or mirror to another S3-compatible storage
mc mirror tank-minio/packages s3-backup/tank-packages
```

#### Automated Backup Script

```bash
#!/bin/bash
# scripts/onprem/backup-minio.sh
BACKUP_DIR="/backups/minio"
DATE=$(date +%Y%m%d_%H%M%S)

mc alias set tank-minio "${S3_ENDPOINT}" "${S3_ACCESS_KEY}" "${S3_SECRET_KEY}"
mc mirror tank-minio/packages "${BACKUP_DIR}/packages_${DATE}"

# Keep only last 7 days
find "${BACKUP_DIR}" -name "packages_*" -mtime +7 -exec rm -rf {} \;
```

### Full Stack Backup

```bash
#!/bin/bash
# scripts/onprem/backup-all.sh
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/backups/tank_${DATE}"

mkdir -p "$BACKUP_DIR"

# Database
docker exec tank-postgres pg_dump -U tank tank > "$BACKUP_DIR/database.sql"

# Object storage
mc mirror tank-minio/packages "$BACKUP_DIR/minio-packages"

# Configuration (without secrets)
cp .env.example.onprem "$BACKUP_DIR/env.template"
cp infra/docker-compose.yml "$BACKUP_DIR/"

echo "Backup complete: $BACKUP_DIR"
```

### Restore Drill

**Test restore procedure monthly:**

1. Spin up isolated test environment
2. Restore database from backup
3. Restore object storage
4. Verify data integrity
5. Test auth + publish/download flows
6. Document time to restore

---

## TLS/HTTPS Configuration

### Option 1: Reverse Proxy (Recommended)

Use Caddy or Nginx as reverse proxy:

#### Caddy (Automatic HTTPS)

```dockerfile
# Dockerfile.caddy
FROM caddy:2
COPY Caddyfile /etc/caddy/Caddyfile
```

```
# Caddyfile
tank.yourcompany.com {
    reverse_proxy web:3000

    # Security headers
    header {
        Strict-Transport-Security "max-age=31536000; includeSubDomains"
        X-Content-Type-Options "nosniff"
        X-Frame-Options "DENY"
    }
}
```

#### Nginx (Manual Certs)

```nginx
# nginx.conf
server {
    listen 443 ssl http2;
    server_name tank.yourcompany.com;

    ssl_certificate /etc/nginx/certs/tank.crt;
    ssl_certificate_key /etc/nginx/certs/tank.key;

    location / {
        proxy_pass http://web:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

### Option 2: Let's Encrypt

```yaml
# docker-compose.prod.yml
services:
  caddy:
    image: caddy:2
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - caddy_data:/data
    depends_on:
      - web
```

### Secure Cookies

Ensure these environment variables for production:

```env
BETTER_AUTH_URL=https://tank.yourcompany.com
NEXT_PUBLIC_APP_URL=https://tank.yourcompany.com
```

Better Auth automatically sets `Secure` flag for cookies when `BETTER_AUTH_URL` uses `https://`.

### mTLS (Mutual TLS) for Internal Services

For high-security deployments, enable mTLS between internal services:

#### Generate Service Certificates

```bash
# Create CA (once)
openssl genrsa -out ca.key 4096
openssl req -new -x509 -days 365 -key ca.key -out ca.crt \
  -subj "/CN=Tank Internal CA"

# Generate web service cert
openssl genrsa -out web.key 2048
openssl req -new -key web.key -out web.csr \
  -subj "/CN=web.tank.internal"
openssl x509 -req -days 365 -in web.csr -CA ca.crt -CAkey ca.key \
  -CAcreateserial -out web.crt

# Generate postgres service cert
openssl genrsa -out postgres.key 2048
openssl req -new -key postgres.key -out postgres.csr \
  -subj "/CN=postgres.tank.internal"
openssl x509 -req -days 365 -in postgres.csr -CA ca.crt -CAkey ca.key \
  -CAcreateserial -out postgres.crt
```

#### Configure PostgreSQL for mTLS

```env
# postgres.env
POSTGRES_SSL=on
POSTGRES_SSL_CERT_FILE=/certs/postgres.crt
POSTGRES_SSL_KEY_FILE=/certs/postgres.key
POSTGRES_SSL_CA_FILE=/certs/ca.crt
```

```yaml
# docker-compose.mtls.yml
services:
  postgres:
    volumes:
      - ./certs:/certs:ro
    environment:
      - POSTGRES_SSL=on
```

#### Configure Web App for mTLS Database Connection

```env
DATABASE_URL=postgresql://tank:password@postgres:5432/tank?sslmode=verify-full&sslrootcert=/certs/ca.crt&sslcert=/certs/web.crt&sslkey=/certs/web.key
```

#### Service-to-Service mTLS with Envoy Sidecar

For comprehensive mTLS, deploy Envoy as a sidecar proxy:

```yaml
# envoy.yaml
static_resources:
  listeners:
    - name: ingress
      address:
        socket_address:
          address: 0.0.0.0
          port_value: 8443
      filter_chains:
        - filters:
            - name: envoy.filters.network.http_connection_manager
              typed_config:
                "@type": type.googleapis.com/envoy.extensions.filters.network.http_connection_manager.v3.HttpConnectionManager
                stat_prefix: ingress_http
                route_config:
                  name: local_route
                  virtual_hosts:
                    - name: backend
                      domains: ["*"]
                      routes:
                        - match: { prefix: "/" }
                          route: { cluster: web_service }
                http_filters:
                  - name: envoy.filters.http.router
          transport_socket:
            name: envoy.transport_sockets.tls
            typed_config:
              "@type": type.googleapis.com/envoy.extensions.transport_sockets.tls.v3.DownstreamTlsContext
              common_tls_context:
                tls_certificates:
                  - certificate_chain: { filename: "/certs/web.crt" }
                    private_key: { filename: "/certs/web.key" }
                validation_context:
                  trusted_ca: { filename: "/certs/ca.crt" }
              require_client_certificate: true

  clusters:
    - name: web_service
      connect_timeout: 5s
      type: STATIC
      lb_policy: ROUND_ROBIN
      load_assignment:
        cluster_name: web_service
        endpoints:
          - lb_endpoints:
              - endpoint:
                  address:
                    socket_address:
                      address: 127.0.0.1
                      port_value: 3000
```

---

## Health Monitoring

### Service Health Endpoints

| Service    | Endpoint             | Expected Response |
| ---------- | -------------------- | ----------------- |
| Web        | `/api/health`        | `{"status":"ok"}` |
| Scanner    | `/health`            | `{"status":"ok"}` |
| PostgreSQL | `pg_isready`         | exit code 0       |
| Redis      | `PING`               | `PONG`            |
| MinIO      | `/minio/health/live` | HTTP 200          |

### Health Check Integration

#### Prometheus

```yaml
# prometheus.yml
scrape_configs:
  - job_name: "tank-web"
    static_configs:
      - targets: ["web:3000"]
    metrics_path: "/api/health"
```

#### Alerting Rules

```yaml
# alertmanager/rules.yml
groups:
  - name: tank
    rules:
      - alert: TankWebDown
        expr: up{job="tank-web"} == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "Tank web app is down"
```

---

## Troubleshooting

### Common Issues

#### Auth: "Failed to sign in"

**Symptoms**: Users cannot log in.

**Checks**:

1. Verify `BETTER_AUTH_SECRET` matches across restarts
2. Check IdP configuration (OIDC_DISCOVERY_URL, etc.)
3. Review browser console for CORS errors
4. Check cookie settings (Secure, SameSite)

#### Database: Connection Refused

**Symptoms**: App fails to start with "connection refused".

**Solution**:

```bash
# Check if postgres is healthy
docker compose ps postgres

# Check connectivity
docker exec tank-web nc -zv postgres 5432

# Verify DATABASE_URL format
echo $DATABASE_URL
```

#### Storage: Upload Failed

**Symptoms**: CLI upload fails with storage error.

**Solution**:

```bash
# Check MinIO health
curl http://localhost:9000/minio/health/live

# Verify credentials
mc alias set test http://localhost:9000 $S3_ACCESS_KEY $S3_SECRET_KEY
mc ls test/

# Check bucket exists
mc mb test/packages --ignore-existing
```

#### Redis: Session Store Errors

**Symptoms**: CLI auth fails randomly.

**Solution**:

```bash
# Check Redis connectivity
docker exec tank-redis redis-cli ping

# Check session store config
docker exec tank-web env | grep SESSION_STORE
docker exec tank-web env | grep REDIS_URL

# If using memory store in multi-instance, switch to Redis
# Set SESSION_STORE=redis and REDIS_URL=redis://redis:6379
```

### Log Collection

```bash
# All services
docker compose logs --tail=100

# Specific service
docker compose logs --tail=100 web

# Follow logs
docker compose logs -f web

# Export logs
docker compose logs > tank-logs-$(date +%Y%m%d).txt
```

---

## Checklist: Production Deployment

Before going live:

- [ ] All secrets stored in secrets manager (not .env files)
- [ ] TLS/HTTPS configured with valid certificates
- [ ] Backup procedures tested and automated
- [ ] Health monitoring configured with alerting
- [ ] Log aggregation set up (Loki, ELK, etc.)
- [ ] Network segmentation (services not exposed to public internet)
- [ ] Regular patching schedule established
- [ ] Incident response runbook documented
- [ ] Restore drill completed successfully
