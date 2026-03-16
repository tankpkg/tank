# On-Prem Bootstrap Module

## Anchor

**Why this module exists:** Self-hosted Tank deployments require an admin to log
into the web UI before they can generate team tokens or manage skills. Current
auth modes all require external infrastructure (SMTP for email verification,
OAuth app for GitHub, IdP registration for OIDC) — creating a chicken-and-egg
problem that blocks enterprise POCs. The person deploying Tank has root access to
the server; requiring them to also verify their email is redundant security theater.

**Consumers:** On-prem deployers (platform engineers, DevOps), `init-db.sh` bootstrap
script, web auth system (better-auth credentials provider).

**Single source of truth:**

- `scripts/onprem/init-db.sh` — admin account creation
- `packages/web/lib/auth.ts` — better-auth config, email verification toggle
- `.env.example.onprem` — on-prem environment variables

---

## Layer 1: Structure

```
scripts/onprem/
  init-db.sh                                  # Creates admin account with env var credentials
.env.example.onprem                           # FIRST_ADMIN_PASSWORD, SKIP_EMAIL_VERIFICATION
packages/web/
  lib/auth.ts                                 # better-auth config — reads SKIP_EMAIL_VERIFICATION
  app/(auth)/sign-in/page.tsx                 # Credentials login form (existing)
```

---

## Layer 2: Constraints

| #   | Rule                                                                                         | Rationale                                                        | Verified by  |
| --- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ------------ |
| C1  | `init-db.sh` creates an admin account using `FIRST_ADMIN_EMAIL` + `FIRST_ADMIN_PASSWORD`     | Admin must be able to log in immediately after deployment        | BDD scenario |
| C2  | The admin account created by `init-db.sh` is marked as email-verified                        | Skips verification flow — deployer controls the server           | BDD scenario |
| C3  | `SKIP_EMAIL_VERIFICATION=true` disables verification for all credential accounts             | On-prem assumes network-level trust; SMTP should not be required | BDD scenario |
| C4  | `SKIP_EMAIL_VERIFICATION` is only respected when `AUTH_PROVIDERS` includes `credentials`     | Flag is meaningless for OAuth/OIDC flows                         | Code review  |
| C5  | Startup logs a warning when `SKIP_EMAIL_VERIFICATION=true`                                   | Deployer must be aware of the security trade-off                 | BDD scenario |
| C6  | `FIRST_ADMIN_PASSWORD` is never logged or included in error messages                         | Credentials must not leak to stdout/stderr                       | Code review  |
| C7  | `init-db.sh` is idempotent — re-running does not create duplicate accounts or reset password | Safe to re-run during troubleshooting                            | BDD scenario |
| C8  | Admin can log into web UI with `FIRST_ADMIN_EMAIL` + `FIRST_ADMIN_PASSWORD` after bootstrap  | End-to-end proof that the bootstrap flow works                   | BDD scenario |
| C9  | tankpkg.dev (SaaS) never sets `SKIP_EMAIL_VERIFICATION`                                      | This is an on-prem-only escape hatch; SaaS always verifies email | CI lint rule |

---

## Layer 3: Examples

| #   | Input                                                                  | Expected Output                                                  |
| --- | ---------------------------------------------------------------------- | ---------------------------------------------------------------- |
| E1  | `init-db.sh` with `FIRST_ADMIN_EMAIL=admin@corp.com` + password set    | Admin account exists in DB, email_verified=true, role=admin      |
| E2  | `init-db.sh` run twice with same email                                 | No duplicate account; no error; password not overwritten         |
| E3  | `init-db.sh` with `FIRST_ADMIN_PASSWORD` unset                         | Script exits with error: "FIRST_ADMIN_PASSWORD is required"      |
| E4  | Web login with admin credentials after bootstrap                       | 200 with valid session cookie                                    |
| E5  | New user signs up via credentials when `SKIP_EMAIL_VERIFICATION=true`  | Account created, email_verified=true, no verification email sent |
| E6  | New user signs up via credentials when `SKIP_EMAIL_VERIFICATION` unset | Standard flow — verification email required before login         |
| E7  | Startup with `SKIP_EMAIL_VERIFICATION=true`                            | Console warning: "Email verification disabled..."                |
