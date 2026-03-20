# Health Module

## Anchor

**Why this module exists:** Operations and monitoring systems need a single endpoint to verify all Tank infrastructure dependencies are reachable: the PostgreSQL database, Redis (CLI auth sessions), object storage, and the Python security scanner. The health check drives alerts, load balancer health checks, and uptime dashboards.

**Consumers:** Load balancers, Kubernetes liveness probes, uptime monitoring (e.g., Better Uptime), ops dashboards.

**Single source of truth:** `apps/registry/src/api/app.ts` (inline health route).

---

## Layer 1: Structure

```
apps/registry/src/api/app.ts   # GET /api/health — inline health check route
```

---

## Layer 2: Constraints

| #   | Rule                                                                                    | Rationale                                     | Verified by  |
| --- | --------------------------------------------------------------------------------------- | --------------------------------------------- | ------------ |
| C1  | Returns `{ status, timestamp, version, checks: { database, redis, storage, scanner } }` | Structured response for monitoring tools      | BDD scenario |
| C2  | `status: "ok"` when all 4 checks are healthy                                            | All green → service is fully operational      | BDD scenario |
| C3  | `status: "degraded"` when 1–2 checks are unhealthy                                      | Partial failure — service still running       | BDD scenario |
| C4  | `status: "error"` when 3+ checks are unhealthy (< 2 healthy); HTTP 503                  | Too degraded to serve safely → alert          | BDD scenario |
| C5  | HTTP 200 for "ok" and "degraded"; HTTP 503 for "error"                                  | Load balancers use HTTP status, not JSON body | BDD scenario |
| C6  | Each check includes `latency` (ms) on success or `error` string on failure              | Latency data helps diagnose slow dependencies | BDD scenario |
| C7  | All 4 checks run in parallel (`Promise.all`)                                            | Health check must respond quickly             | Code review  |

---

## Layer 3: Examples

| #   | Input                                                         | Expected                                                                  |
| --- | ------------------------------------------------------------- | ------------------------------------------------------------------------- |
| E1  | All dependencies healthy                                      | 200: `{ status: "ok", checks: { database: { status: "healthy" }, ... } }` |
| E2  | Database healthy, other 3 unhealthy                           | 503: `{ status: "error" }`                                                |
| E3  | Database + Redis healthy, storage + scanner unhealthy         | 200: `{ status: "degraded" }`                                             |
| E4  | Response always includes `timestamp` (ISO 8601) and `version` | Traceable to a deployment version                                         |
