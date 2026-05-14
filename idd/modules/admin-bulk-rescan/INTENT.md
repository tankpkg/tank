# Admin Bulk Rescan Module

## Anchor

**Why this module exists:** When the security scanner is updated with new detection capabilities, existing skills need to be re-scanned. Admins need a bulk rescan operation that targets skills by audit status and/or scan staleness without issuing individual rescan requests per version.

**Consumers:** Admin dashboard, `POST /api/admin/packages/rescan-many`.

**Single source of truth:**
- `apps/registry/src/lib/skills/bulk-rescan.ts` — pure orchestrator (concurrency, slicing, dry run)
- `apps/registry/src/lib/skills/bulk-rescan-db.ts` — DB query for candidates + wiring to `runRescan`
- `apps/registry/src/api/routes/admin/packages.ts` — HTTP endpoint

Reuses the same per-version scanner pipeline as the existing single-package rescan.

---

## Layer 1: Structure

```
apps/registry/src/lib/skills/bulk-rescan.ts      # Pure orchestrator + types + caps (MAX_LIMIT, MAX_CONCURRENCY)
apps/registry/src/lib/skills/bulk-rescan-db.ts   # findRescanCandidates() + runBulkRescan() (DB-aware wrapper)
apps/registry/src/lib/skills/bulk-rescan.test.ts # Unit tests for the orchestrator (10 tests)
apps/registry/src/api/routes/admin/packages.ts   # POST /rescan-many — bulk trigger; POST /:name/rescan — per-version
```

---

## Layer 2: Constraints

| #   | Rule                                                                                                              | Rationale                                                  | Verified by         |
| --- | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ------------------- |
| C1  | Requires admin session; 401 otherwise                                                                             | Bulk rescan is a privileged, resource-intensive operation  | requireAdmin guard  |
| C2  | Accepts optional `status: string[]` filter to target specific version audit statuses                              | Avoid re-scanning already-healthy versions                 | Type signature      |
| C3  | Accepts optional `beforeScannedAt: ISO8601 string` to target stale scans (e.g. older than a recent scanner fix)   | Backfill after a scanner update without rescanning all     | Type signature      |
| C4  | Per-call limit capped at `MAX_LIMIT` (50); concurrency capped at `MAX_CONCURRENCY` (5)                            | Stay within Vercel serverless function timeout (~300s)     | Unit test           |
| C5  | Returns `{ matched, rescanned, remaining, results[] }` for pagination — caller iterates until `remaining === 0`   | Backfills larger than `MAX_LIMIT` must be paginable        | Unit test           |
| C6  | Per-candidate failures are captured into `results[i].error` and do not abort the batch                            | One broken tarball must not block dozens of others         | Unit test           |
| C7  | `dryRun: true` returns the candidate slice without invoking the scanner                                           | Lets admins preview the blast radius before committing     | Unit test           |
| C8  | Each successful bulk operation writes an `admin.package.rescan_many` audit event                                  | Operational audit trail for privileged actions             | Endpoint handler    |
| C9  | Individual `POST /admin/packages/[name]/rescan` is unchanged                                                      | Per-version rescan remains the unit; bulk is orchestration | Existing handler    |

---

## Layer 3: Examples

| #   | Input                                                                                          | Expected                                                                 |
| --- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| E1  | `POST /admin/packages/rescan-many` as admin, empty body                                        | 200: rescans up to `DEFAULT_LIMIT` (10) most recently published versions |
| E2  | `POST /admin/packages/rescan-many` as non-admin                                                | 401                                                                      |
| E3  | `POST /admin/packages/rescan-many` `{ "status": ["failed", "flagged"] }`                       | 200: only failed/flagged versions queued                                 |
| E4  | `POST /admin/packages/rescan-many` `{ "beforeScannedAt": "2026-05-12T10:00:00Z", "limit": 25 }` | 200: rescans up to 25 versions whose latest scan predates the cutoff     |
| E5  | `POST /admin/packages/rescan-many` `{ "dryRun": true }`                                        | 200: returns matched count + candidate slice, no scans performed         |
| E6  | `POST /admin/packages/rescan-many` `{ "limit": 9999 }`                                         | 200: silently capped at `MAX_LIMIT` (50)                                 |
