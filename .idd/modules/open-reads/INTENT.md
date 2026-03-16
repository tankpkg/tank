# Open Reads Module

## Anchor

**Why this module exists:** On-prem Tank registries sit behind corporate VPNs where
network access IS the authorization. Requiring authentication for read operations
(install, search, info) creates friction that no other internal artifact registry
imposes. `AUTH_MODE=open-reads` makes all skills readable without authentication
while still requiring auth for writes (publish). This matches the Artifactory/Nexus/
Verdaccio model that enterprise platform teams expect.

**Consumers:** Web API routes (skill read endpoints), CLI (install/search/info without
token), on-prem deployers (env var configuration).

**Single source of truth:**

- `packages/web/lib/auth-helpers.ts` — `isOpenReadsMode()` helper, visibility clause
- `packages/web/app/api/v1/skills/[name]/route.ts` — skill metadata endpoint
- `packages/web/app/api/v1/skills/[name]/[version]/route.ts` — version metadata + download URL
- `packages/web/app/api/v1/skills/[name]/versions/route.ts` — version listing
- `packages/web/app/api/v1/search/route.ts` — search endpoint
- `.env.example.onprem` — `AUTH_MODE` configuration

---

## Layer 1: Structure

```
packages/web/
  lib/auth-helpers.ts                              # isOpenReadsMode(), modified visibility clause
  app/api/v1/skills/[name]/route.ts                # GET — skill metadata (open when AUTH_MODE=open-reads)
  app/api/v1/skills/[name]/[version]/route.ts      # GET — version + download URL (open when AUTH_MODE=open-reads)
  app/api/v1/skills/[name]/versions/route.ts       # GET — version listing (open when AUTH_MODE=open-reads)
  app/api/v1/search/route.ts                       # GET — search (open when AUTH_MODE=open-reads)
  app/api/v1/skills/route.ts                       # POST — publish (always requires auth)
  app/api/v1/skills/confirm/route.ts               # POST — confirm publish (always requires auth)
.env.example.onprem                                # AUTH_MODE=open-reads | standard
```

---

## Layer 2: Constraints

| #   | Rule                                                                                          | Rationale                                                               | Verified by  |
| --- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ------------ |
| C1  | `AUTH_MODE=open-reads` makes all GET skill endpoints return data without authentication       | On-prem reads should be frictionless — VPN is the access control        | BDD scenario |
| C2  | `AUTH_MODE=open-reads` exposes ALL skills regardless of `visibility` field (public + private) | On-prem "private" means "private from the internet," not from coworkers | BDD scenario |
| C3  | `AUTH_MODE=open-reads` does NOT affect write endpoints — publish still requires valid token   | Accountability for authorship must always be maintained                 | BDD scenario |
| C4  | `AUTH_MODE=standard` (default) preserves current behavior — visibility checks enforced        | No behavior change for tankpkg.dev or deployments that don't opt in     | BDD scenario |
| C5  | `AUTH_MODE` env var accepts only `open-reads` or `standard`; other values log error + default | Typos must not silently create insecure configurations                  | BDD scenario |
| C6  | `isOpenReadsMode()` is a single utility function — all routes call it, not inline env checks  | Centralized logic prevents inconsistent behavior across endpoints       | Code review  |
| C7  | Search results in `open-reads` mode include private skills with full metadata                 | Discoverability — teams need to find internal skills                    | BDD scenario |
| C8  | Download URLs (signed Supabase/S3 URLs) are still generated for unauthenticated requests      | Download must work end-to-end without auth                              | BDD scenario |

---

## Layer 3: Examples

| #   | Input                                                                      | Expected Output                                                |
| --- | -------------------------------------------------------------------------- | -------------------------------------------------------------- |
| E1  | `GET /api/v1/skills/@org/skill` without auth, `AUTH_MODE=open-reads`       | 200 with full skill metadata (even if skill is marked private) |
| E2  | `GET /api/v1/skills/@org/skill` without auth, `AUTH_MODE=standard`         | 404 or 403 if skill is private                                 |
| E3  | `GET /api/v1/search?q=internal` without auth, `AUTH_MODE=open-reads`       | Returns all matching skills including private ones             |
| E4  | `GET /api/v1/search?q=internal` without auth, `AUTH_MODE=standard`         | Returns only public skills                                     |
| E5  | `POST /api/v1/skills` without auth, `AUTH_MODE=open-reads`                 | 401 — publish always requires authentication                   |
| E6  | `POST /api/v1/skills` with valid token, `AUTH_MODE=open-reads`             | 200 — publish works normally with auth                         |
| E7  | `GET /api/v1/skills/@org/skill/1.0.0` without auth, `AUTH_MODE=open-reads` | 200 with metadata + valid signed download URL                  |
| E8  | Server starts with `AUTH_MODE=invalid-value`                               | Logs error, falls back to `standard`                           |
| E9  | `tank install @org/private-skill` without login, `AUTH_MODE=open-reads`    | Install succeeds — download URL works without Bearer header    |
