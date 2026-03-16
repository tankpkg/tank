# Admin Users Module

## Anchor

**Why this module exists:** Admins need to manage the user base: list accounts, search by name/email, filter by role or status, and suspend or ban users who violate policies. Suspension state is tracked in a `user_status` audit log rather than mutating the user record, preserving history.

**Consumers:** Admin web dashboard, `GET /api/admin/users` and `PATCH /api/admin/users/[userId]/status`.

**Single source of truth:** `apps/registry-legacy/app/api/admin/users/route.ts` and `apps/registry-legacy/app/api/admin/users/[userId]/status/route.ts`. Requires `withAdminAuth` middleware (admin session cookie).

---

## Layer 1: Structure

```
apps/registry-legacy/app/api/admin/users/route.ts               # GET — list with pagination, search, role/status filters
apps/registry-legacy/app/api/admin/users/[userId]/route.ts      # GET — single user detail
apps/registry-legacy/app/api/admin/users/[userId]/status/route.ts # PATCH — suspend/ban/activate user
apps/registry-legacy/lib/admin-middleware.ts                    # withAdminAuth — enforces admin session
```

---

## Layer 2: Constraints

| #   | Rule                                                                                         | Rationale                                     | Verified by  |
| --- | -------------------------------------------------------------------------------------------- | --------------------------------------------- | ------------ |
| C1  | All routes require admin session cookie; 401 if missing                                      | Only admins can manage users                  | BDD scenario |
| C2  | `GET /users` supports `page`, `limit`, `search`, `role`, `status` query params               | Dashboard needs filtering and pagination      | BDD scenario |
| C3  | `search` matches `name`, `email`, or `githubUsername` (ILIKE)                                | Admins search by any identifier               | BDD scenario |
| C4  | Latest status is joined via subquery on `user_status` table (most recent row per user)       | User status is append-only audit log          | BDD scenario |
| C5  | Response includes `total`, `page`, `limit`, `totalPages` for pagination                      | Dashboard must know how many pages exist      | BDD scenario |
| C6  | `PATCH /users/[userId]/status` with `status: "suspended"` creates a new `user_status` record | Status changes are auditable, not destructive | BDD scenario |

---

## Layer 3: Examples

| #   | Input                                                                          | Expected                                         |
| --- | ------------------------------------------------------------------------------ | ------------------------------------------------ |
| E1  | `GET /admin/users` as admin                                                    | 200: `{ users: [...], total, page, totalPages }` |
| E2  | `GET /admin/users` as non-admin                                                | 401                                              |
| E3  | `GET /admin/users?search=alice`                                                | Users matching "alice" in name/email             |
| E4  | `GET /admin/users?role=admin`                                                  | Only admin users returned                        |
| E5  | `GET /admin/users?status=suspended`                                            | Only suspended users returned                    |
| E6  | `PATCH /admin/users/[id]/status` with `{ status: "suspended", reason: "TOS" }` | 200, user_status record created                  |
