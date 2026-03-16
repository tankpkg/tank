# Admin Packages Module

## Anchor

**Why this module exists:** Admins need to inspect and moderate the skill catalog: list all packages regardless of visibility, filter by status or featured flag, view per-package download counts and version history, and change package status (quarantine, deprecate, remove). This is the primary tool for responding to security incidents.

**Consumers:** Admin dashboard. `GET /api/admin/packages`, `GET /api/admin/packages/[name]`, `PATCH /api/admin/packages/[name]/status`.

**Single source of truth:** `apps/registry-legacy/app/api/admin/packages/route.ts` and `apps/registry-legacy/app/api/admin/packages/[...segments]/route.ts`.

---

## Layer 1: Structure

```
apps/registry-legacy/app/api/admin/packages/route.ts              # GET — list packages with filters
apps/registry-legacy/app/api/admin/packages/[...segments]/route.ts # GET/PATCH — package detail and status update
apps/registry-legacy/lib/admin-middleware.ts                      # withAdminAuth
```

---

## Layer 2: Constraints

| #   | Rule                                                                                                  | Rationale                                        | Verified by  |
| --- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------ | ------------ |
| C1  | All routes require admin session                                                                      | Admin-only moderation                            | BDD scenario |
| C2  | `GET /packages` supports `page`, `limit`, `search`, `status`, `featured` filters                      | Admins need targeted views into the catalog      | BDD scenario |
| C3  | `status` filter validates against `['active', 'deprecated', 'quarantined', 'removed']`; invalid → 400 | Prevents silent filter failures                  | BDD scenario |
| C4  | Response includes `publisher` name/email, `versionCount`, `downloadCount` per package                 | Dashboard shows publish and usage data           | BDD scenario |
| C5  | `PATCH /packages/[name]/status` with `{ status: "quarantined" }` updates the skill record             | Admins can immediately remove malicious packages | BDD scenario |

---

## Layer 3: Examples

| #   | Input                                                                 | Expected                    |
| --- | --------------------------------------------------------------------- | --------------------------- |
| E1  | `GET /admin/packages` as admin                                        | 200: paginated package list |
| E2  | `GET /admin/packages?status=quarantined`                              | Only quarantined packages   |
| E3  | `GET /admin/packages?status=invalid`                                  | 400: invalid status         |
| E4  | `GET /admin/packages?search=react`                                    | Packages matching "react"   |
| E5  | `PATCH /admin/packages/@org/skill/status` `{ status: "quarantined" }` | 200                         |
