# Admin Service Accounts Module

## Anchor

**Why this module exists:** CI/CD pipelines and automation tools need machine-to-machine authentication with scoped API keys (e.g., `skills:publish` for automated publishing). Service accounts decouple automation auth from individual user accounts and allow fine-grained scope control.

**Consumers:** Admin dashboard. `GET/POST /api/admin/service-accounts`, `GET/PATCH/DELETE /api/admin/service-accounts/[id]`, `POST /api/admin/service-accounts/[id]/keys`, `DELETE /api/admin/service-accounts/[id]/keys/[keyId]`.

**Single source of truth:** `apps/registry-legacy/app/api/admin/service-accounts/` routes.

---

## Layer 1: Structure

```
apps/registry-legacy/app/api/admin/service-accounts/route.ts               # GET/POST — list/create service accounts
apps/registry-legacy/app/api/admin/service-accounts/[id]/route.ts          # GET/PATCH/DELETE — manage single account
apps/registry-legacy/app/api/admin/service-accounts/[id]/keys/route.ts     # POST — create API key
apps/registry-legacy/app/api/admin/service-accounts/[id]/keys/[keyId]/route.ts # DELETE — revoke API key
```

---

## Layer 2: Constraints

| #   | Rule                                                                                                                    | Rationale                                     | Verified by  |
| --- | ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | ------------ |
| C1  | All routes require admin session                                                                                        | Service accounts are admin-managed resources  | BDD scenario |
| C2  | `POST /service-accounts` creates an account with a name and optional scopes                                             | Scopes define what the account can do         | BDD scenario |
| C3  | `POST /service-accounts/[id]/keys` creates an API key; the raw key is returned ONCE and never again stored in plaintext | Security: key must be copied at creation time | BDD scenario |
| C4  | `DELETE /keys/[keyId]` revokes the key immediately                                                                      | Compromised keys must be immediately blocked  | BDD scenario |
| C5  | `DELETE /service-accounts/[id]` removes the account and all associated keys                                             | Clean removal prevents dangling key records   | BDD scenario |

---

## Layer 3: Examples

| #   | Input                                                                                 | Expected                                |
| --- | ------------------------------------------------------------------------------------- | --------------------------------------- |
| E1  | `POST /admin/service-accounts` `{ name: "CI Publisher", scopes: ["skills:publish"] }` | 200: service account created            |
| E2  | `POST /admin/service-accounts/[id]/keys`                                              | 200: `{ key: "tank_..." }` (shown once) |
| E3  | `DELETE /admin/service-accounts/[id]/keys/[keyId]`                                    | 200: key revoked                        |
| E4  | `DELETE /admin/service-accounts/[id]`                                                 | 200: account and keys removed           |
| E5  | Any route unauthenticated                                                             | 401                                     |
