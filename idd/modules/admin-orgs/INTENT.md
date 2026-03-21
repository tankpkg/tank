# Admin Orgs Module

## Anchor

**Why this module exists:** Admins need visibility and control over organizations: listing all orgs, viewing membership, and managing org-level status. Organizations are the namespace owners for scoped skills (`@org/skill`), so admin control is critical for abuse prevention.

**Consumers:** Admin dashboard. `GET /api/admin/orgs`, `GET /api/admin/orgs/[orgId]`, `DELETE /api/admin/orgs/[orgId]/members/[memberId]`.

**Single source of truth:** `Implemented: apps/registry/src/api/routes/admin/orgs.ts`. Requires `requireAdmin` middleware.

---

## Layer 1: Structure

```
# Implemented: apps/registry/src/api/routes/admin/orgs.ts  # GET list, GET detail, DELETE member
apps/registry/src/api/middleware/require-admin.ts          # requireAdmin
```

---

## Layer 2: Constraints

| #   | Rule                                                                      | Rationale                                  | Verified by  |
| --- | ------------------------------------------------------------------------- | ------------------------------------------ | ------------ |
| C1  | All routes require admin session; 401 otherwise                           | Admin-only namespace management            | BDD scenario |
| C2  | `GET /orgs` returns paginated list with org slug, name, member count      | Admins need overview of all namespaces     | BDD scenario |
| C3  | `GET /orgs/[orgId]` returns full org detail including members             | Admins need to audit org membership        | BDD scenario |
| C4  | `DELETE /orgs/[orgId]/members/[memberId]` removes the member from the org | Admin moderation power over org membership | BDD scenario |

---

## Layer 3: Examples

| #   | Input                                        | Expected                     |
| --- | -------------------------------------------- | ---------------------------- |
| E1  | `GET /admin/orgs` as admin                   | 200: paginated org list      |
| E2  | `GET /admin/orgs` as non-admin               | 401                          |
| E3  | `GET /admin/orgs/[id]`                       | 200: org detail with members |
| E4  | `DELETE /admin/orgs/[id]/members/[memberId]` | 200: member removed          |
