# Admin Bulk Rescan Module

## Anchor

**Why this module exists:** When the security scanner is updated with new detection capabilities, existing skills need to be re-scanned. Admins need a bulk rescan operation that targets skills by status (e.g., all `pending` versions) without requiring individual rescan requests per version.

**Consumers:** Admin dashboard, `POST /api/admin/rescan-skills`.

**Single source of truth:** `TODO: port to apps/registry/src/api/routes/admin/rescan-skills.ts`. Calls the same scanner pipeline as the per-version rescan.

---

## Layer 1: Structure

```
TODO: port to apps/registry/src/api/routes/admin/rescan-skills.ts  # POST — bulk rescan trigger
TODO: port to apps/registry/src/api/routes/admin/packages.ts      # POST versions/[v]/rescan — per-version rescan
```

---

## Layer 2: Constraints

| #   | Rule                                                                                                             | Rationale                                                 | Verified by  |
| --- | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | ------------ |
| C1  | Requires admin session; 401 otherwise                                                                            | Bulk rescan is a privileged, resource-intensive operation | BDD scenario |
| C2  | Accepts optional `status` filter to target specific version audit statuses                                       | Avoid re-scanning already-healthy versions                | BDD scenario |
| C3  | Returns count of versions queued for rescan                                                                      | Admins need to know the scope of the operation            | BDD scenario |
| C4  | Individual `POST /admin/packages/[name]/versions/[v]/rescan` is already tested in `admin/rescan-version.feature` | Per-version rescan is the unit; bulk is orchestration     | Existing BDD |

---

## Layer 3: Examples

| #   | Input                                               | Expected                     |
| --- | --------------------------------------------------- | ---------------------------- |
| E1  | `POST /admin/rescan-skills` as admin                | 200: `{ queued: N }`         |
| E2  | `POST /admin/rescan-skills` as non-admin            | 401                          |
| E3  | `POST /admin/rescan-skills` `{ status: "pending" }` | Only pending versions queued |
