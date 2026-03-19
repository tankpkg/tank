# On-Prem Setup Wizard

## Layer 1 — Purpose

First-boot web wizard for self-hosted Tank. Guides admin through complete setup without CLI tools, git clone, or manual env editing. One `docker compose up` → browser wizard → working Tank instance.

## Layer 2 — Constraints

### Boot Behavior

| Constraint       | Rule                                                                                                    |
| ---------------- | ------------------------------------------------------------------------------------------------------- |
| Setup guard      | All routes redirect to `/setup` until `system_config.setup_completed = true`                            |
| DB not reachable | Wizard Step 1 (DB config) is the only step that works without DB                                        |
| Step ordering    | Step 1 (DB) must complete before steps 2-7 become accessible                                            |
| Headless bypass  | If `FIRST_ADMIN_EMAIL` + `FIRST_ADMIN_PASSWORD` + `AUTO_MIGRATE=true` are ALL set, skip wizard entirely |
| Idempotent       | Re-running wizard on already-setup instance is a no-op (redirect to app)                                |

### system_config Table

| Constraint        | Rule                                                                       |
| ----------------- | -------------------------------------------------------------------------- |
| Singleton         | Always exactly 1 row, `id = 1`                                             |
| Secrets encrypted | All `_enc` columns use AES-256-GCM with `BETTER_AUTH_SECRET` as master key |
| Env var override  | Env vars take precedence over DB values (runtime env → DB → defaults)      |

### Auth Config

| Constraint          | Rule                                                                           |
| ------------------- | ------------------------------------------------------------------------------ |
| Restart required    | GitHub/OIDC config changes require container restart to take effect            |
| Entrypoint loads DB | Docker entrypoint reads `system_config` → exports as env vars → starts Next.js |

### Scanner LLM Config

| Constraint            | Rule                                                                  |
| --------------------- | --------------------------------------------------------------------- |
| Per-request injection | Web reads LLM config from DB → decrypts → passes in scan request body |
| Scanner fallback      | Scanner uses request body config if present, falls back to env vars   |
| Test connection       | Wizard tests LLM connection before saving config                      |

## Layer 3 — Examples

### Wizard Steps

| Step              | Input                                         | Output                                                              | Validation                                  |
| ----------------- | --------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------- |
| 1. Database       | `DATABASE_URL` string                         | Schema pushed via `drizzle-kit push`, `system_config` table created | Test connection returns OK                  |
| 2. Instance URL   | Public URL (e.g., `https://tank.company.com`) | Stored in `system_config.instance_url`                              | URL is reachable from server                |
| 3. Storage        | S3 endpoint, credentials, bucket name         | Bucket created if missing, test upload succeeds                     | `PUT` + `GET` + `DELETE` test object        |
| 4. Admin          | Email + password                              | User created, promoted to `admin` role                              | Email valid, password ≥ 8 chars             |
| 5. Auth Providers | Toggle GitHub/OIDC + credentials              | Encrypted in `system_config`, restart notice shown                  | Client ID + Secret both provided if enabled |
| 6. Scanner LLM    | Pick provider + API key                       | Encrypted in `system_config`, injected per scan                     | Test call to LLM returns a response         |
| 7. Complete       | Confirm button                                | `setup_completed = true`, redirect to `/`                           | All prior steps valid                       |

### Headless Mode

| Input                                                                                | Output                                                                                |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| `AUTO_MIGRATE=true` + `FIRST_ADMIN_EMAIL=a@b.com` + `FIRST_ADMIN_PASSWORD=secret123` | Entrypoint: push schema → create user → promote admin → start app. No wizard.         |
| `AUTO_MIGRATE=true` + missing password                                               | Entrypoint fails with clear error: "FIRST_ADMIN_PASSWORD required for headless setup" |
| No `AUTO_MIGRATE`                                                                    | Normal boot: wizard shows if setup incomplete                                         |

### Encryption

| Input                                        | Output                                 |
| -------------------------------------------- | -------------------------------------- |
| `encrypt("sk-groq-xxx", BETTER_AUTH_SECRET)` | AES-256-GCM ciphertext + IV + auth tag |
| `decrypt(ciphertext, BETTER_AUTH_SECRET)`    | Original plaintext `"sk-groq-xxx"`     |
| `decrypt(ciphertext, wrong_key)`             | Error: decryption failed               |

### Setup Guard Middleware

| Request            | `setup_completed` | Response                                    |
| ------------------ | ----------------- | ------------------------------------------- |
| `GET /`            | `false`           | 302 → `/setup`                              |
| `GET /setup`       | `false`           | 200 (wizard page)                           |
| `GET /api/health`  | `false`           | 200 (health always accessible)              |
| `GET /setup/api/*` | `false`           | 200 (wizard API routes always accessible)   |
| `GET /`            | `true`            | 200 (normal app)                            |
| `GET /setup`       | `true`            | 302 → `/` (wizard inaccessible after setup) |
