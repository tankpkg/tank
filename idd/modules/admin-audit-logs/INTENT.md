# Admin Audit Logs Module

## Anchor

**Why this module exists:** Security-sensitive actions (status changes, rescans, key revocations) must be traceable. The audit log provides a tamper-evident, append-only record of who did what and when, enabling incident investigations and compliance reviews.

**Consumers:** Admin dashboard. `GET /api/admin/audit-logs`.

**Single source of truth:** `apps/registry-legacy/app/api/admin/audit-logs/route.ts`. Writes to `audit_events` table via `logAuditEvent()`.

---

## Layer 1: Structure

```
apps/registry-legacy/app/api/admin/audit-logs/route.ts   # GET — paginated audit events with filters
apps/registry-legacy/lib/db/schema.ts                    # audit_events table: action, actorId, targetType, targetId, metadata
```

---

## Layer 2: Constraints

| #   | Rule                                                                                   | Rationale                                          | Verified by  |
| --- | -------------------------------------------------------------------------------------- | -------------------------------------------------- | ------------ |
| C1  | Requires admin session; 401 otherwise                                                  | Audit logs contain sensitive information           | BDD scenario |
| C2  | Supports `action`, `actorId`, `targetType`, `targetId`, `startDate`, `endDate` filters | Admins need to narrow searches for specific events | BDD scenario |
| C3  | `startDate`/`endDate` must be valid ISO dates; invalid → 400                           | Prevents silent date parse failures                | BDD scenario |
| C4  | Response joins `actor` name and email from `user` table                                | Human-readable actor identity in each event        | BDD scenario |
| C5  | Events returned in descending `createdAt` order                                        | Most recent events shown first                     | BDD scenario |
| C6  | Supports `page` + `limit` pagination; returns `total`, `totalPages`                    | Large logs need pagination                         | BDD scenario |

---

## Layer 3: Examples

| #   | Input                                         | Expected                                          |
| --- | --------------------------------------------- | ------------------------------------------------- |
| E1  | `GET /admin/audit-logs` as admin              | 200: `{ events: [...], total, page, totalPages }` |
| E2  | `GET /admin/audit-logs` as non-admin          | 401                                               |
| E3  | `GET /admin/audit-logs?action=rescan`         | Only rescan events                                |
| E4  | `GET /admin/audit-logs?startDate=invalid`     | 400: "Invalid startDate"                          |
| E5  | Each event includes `actorName`, `actorEmail` | Actor is identified by name                       |
