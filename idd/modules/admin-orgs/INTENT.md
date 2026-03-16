# Admin Orgs Module

## Anchor

**Why this module exists:** Admins need visibility and control over organizations: listing all orgs, viewing membership, and managing org-level status. Organizations are the namespace owners for scoped skills (`@org/skill`), so admin control is critical for abuse prevention.

**Consumers:** Admin dashboard. `GET /api/admin/orgs`, `GET /api/admin/orgs/[orgId]`, `DELETE /api/admin/orgs/[orgId]/members/[memberId]`.

**Single source of truth:** `apps/registry-legacy/app/api/admin/orgs/` routes. Requires `withAdminAuth`.

---

## Layer 1: Structure

```
apps/registry-legacy/app/api/admin/orgs/route.ts                         # GET — list orgs with pagination
apps/registry-legacy/app/api/admin/orgs/[orgId]/route.ts                 # GET — org detail
apps/registry-legacy/app/api/admin/orgs/[orgId]/members/[memberId]/route.ts # DELETE — remove member
apps/registry-legacy/lib/admin-middleware.ts                             # withAdminAuth
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
