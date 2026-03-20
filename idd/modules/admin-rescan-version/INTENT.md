# Admin: Rescan Version Module

## Anchor

**Why this module exists:** After a skill version has been published and the scanner has run,
an admin may need to re-trigger the security scan for a specific version — because the scanner
was improved, a new vulnerability was discovered, or the initial scan failed. The rescan
endpoint enqueues a background re-scan and returns the updated status. Only admin users
(authenticated via session cookie) can trigger rescans.

**Consumers:** Admin dashboard UI, admin API clients, BDD tests.

**Single source of truth:**

- `TODO: port to apps/registry/src/api/routes/admin/packages.ts` — handles
  `POST /api/admin/packages/{name}/versions/{version}/rescan`
- `apps/registry/src/api/middleware/require-admin.ts` — `requireAdmin()` — session-based admin auth
- `bdd/interactions/admin-api-client.ts` — `postRescan()` helper

---

## Layer 1: Structure

```
apps/
  TODO: port to registry/src/api/routes/admin/packages.ts  # POST .../rescan — admin-auth, enqueue rescan
  registry/src/api/middleware/require-admin.ts              # requireAdmin() — session cookie validation
bdd/
  interactions/admin-api-client.ts                   # postRescan(), createAdminSession(), createTestPackageVersion()
  steps/system/admin-rescan.steps.ts                 # BDD step definitions
  features/system/admin/rescan-version.feature       # BDD feature file
```

---

## Layer 2: Constraints

| #   | Rule                                                                              | Rationale                                                                | Verified by   |
| --- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ------------- |
| C1  | Rescan requires an active admin session (session cookie) — returns 401 without it | Only admins should be able to trigger rescans; prevents abuse            | BDD scenario  |
| C2  | Non-admin users (regular session) are rejected with 403                           | Admin role is required; authenticated-but-not-admin must be blocked      | BDD scenario  |
| C3  | If the package name or version does not exist, returns 404                        | Clear error; prevents confusing silent success for nonexistent resources | BDD scenario  |
| C4  | Successful rescan trigger returns 200 with status field                           | Caller knows the request was accepted                                    | BDD assertion |
| C5  | The version's `audit_status` is updated to reflect the rescan was queued          | Database state matches the triggered action                              | BDD assertion |
| C6  | URL-encoded package names (e.g. `@org%2Fskill`) are correctly decoded             | Scoped packages require URL encoding in path segments                    | BDD scenario  |
| C7  | Rescan endpoint path: `POST /api/admin/packages/{name}/versions/{version}/rescan` | Canonical URL for admin rescan operations                                | BDD assertion |

---

## Layer 3: Examples

| #   | Input                                                     | Expected Output                                        |
| --- | --------------------------------------------------------- | ------------------------------------------------------ |
| E1  | Admin POSTs rescan for existing package version           | 200; `{ status: "queued" }` or similar                 |
| E2  | Unauthenticated POST to rescan                            | 401 Unauthorized                                       |
| E3  | Regular user (non-admin) POST to rescan                   | 403 Forbidden                                          |
| E4  | Admin POSTs rescan for nonexistent package                | 404 Not Found                                          |
| E5  | Admin POSTs rescan for `@org/skill` (scoped, URL-encoded) | 200; scan queued; no routing errors from encoded slash |
