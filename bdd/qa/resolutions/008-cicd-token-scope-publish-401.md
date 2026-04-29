# Resolution: CI/CD Tokens with Scopes Fail Publish with 401

**Issue:** User-reported (Tank instance) — all newly-issued CI/CD API tokens
fail `tank publish` with HTTP 401, even when the token has `skills:publish`
scope. `tank whoami` succeeds with the same token, proving the token itself is
valid. The CLI surfaces a misleading "Authentication failed. Run: tank login"
because that is the generic message it shows for 401 from the publish endpoint.

**Date:** 2026-04-28
**Methodology:** @tank/bulletproof — Bug Fix Protocol (INTENT → RED → GREEN)
**Files changed:**

- `idd/modules/web-publish/INTENT.md` — added C1a..C1d (positive scope behavior,
  legacy-NULL backward compat, 403 vs 401 distinction) and E1a..E1c, plus a
  Bug History row for traceability.
- `bdd/features/system/web-publish/api-token-scopes.feature` — new feature file
  with four scenarios mapping to the new constraints/examples.
- `bdd/steps/system/web-publish-token-scopes.steps.ts` — new step file. Real
  PostgreSQL + real registry HTTP, zero mocks. Inserts API keys directly into
  `apikey` with the exact `permissions` JSON shape the production dashboard
  writes, then exercises the same `/api/v1/skills` route a real CLI would hit.
- `apps/registry/src/lib/auth/authz.ts` — fixed `parseScopes` double-prefix
  bug; removed scope-checking responsibility from `verifyCliAuth`; exported
  `hasRequiredScopes` so callers can return 403 distinctly from 401.
- `apps/registry/src/api/routes/v1/skills-publish.ts` — split the auth check
  into 401 (no/invalid token) and 403 (token lacks `skills:publish`) paths.
  Updated OpenAPI 403 description to match.

## Finding

The dashboard server function `tokens.ts:createTokenFn` calls
`auth.api.createApiKey({ body: { ..., permissions: { skills: normalizedScopes } } })`,
where `normalizedScopes` is an array of strings that already contain the
`skills:` prefix (e.g. `['skills:publish']`). better-auth stores this verbatim
as `permissions = '{"skills":["skills:publish"]}'` — a **double-prefixed** shape.

`parseScopes` in `authz.ts` then converts that JSON back to an array by
prefixing every element with `${resource}:`, producing
`['skills:skills:publish']`. The publish route requires `['skills:publish']`,
which is **never** in that set, so the scope check fails for every scoped
token a user creates. `verifyCliAuth` returns `null`, and `skills-publish.ts`
returns 401 with a hardcoded "skills:publish required" message.

Two compounding bugs:

1. **Storage/parse format mismatch.** `tokens.ts` writes prefixed scopes inside
   a `{ skills: [...] }` envelope, while `parseScopes` always re-prefixes. Net
   effect: every scoped token that a real user creates is broken on read.

2. **401 conflated with 403.** `verifyCliAuth(req, requiredScopes)` returned
   `null` whether the token was missing, invalid, blocked, or simply
   under-scoped. The caller had no way to surface the correct status code.
   The CLI maps 401 to "log in again" — which is wrong advice for a
   scope-deficient token.

The legacy `publish-api.feature` happened to pass the auth gate via a third
path: it inserts apikey rows with no `permissions` column, which `parseScopes`
treats as legacy backward-compat (returns `[]`), and `hasRequiredScopes`
returns `true` for empty granted scopes. So the test suite was green even
though every scoped token in production was failing — the test setup
inadvertently bypassed the bug surface.

`@internal/bdd` is also excluded from CI (`turbo run test --filter='!@internal/bdd'`),
so even the legacy publish-api auth break (visible only via real DB + real
registry) was never caught.

## Fix

### apps/registry/src/lib/auth/authz.ts

Three minimal edits:

1. `parseScopes` now strips a redundant `${resource}:` prefix when an entry
   already starts with it, making it tolerant of both the canonical
   `{ skills: ['publish'] }` shape and the bug-mimicking
   `{ skills: ['skills:publish'] }` shape. This fixes existing corrupt rows
   in production without requiring a backfill.

2. `hasRequiredScopes` is now exported so callers can run the scope check
   themselves and pick the right HTTP status code.

3. `verifyCliAuth` no longer accepts `requiredScopes` and never short-circuits
   on scope. It now does one thing only: verify the bearer token. The returned
   `VerifiedApiKey` carries the parsed scopes for the caller to inspect.
   A docstring on `verifyCliAuth` explicitly tells future engineers to do the
   scope check separately and return 403 (not 401) on failure — to prevent the
   exact regression we just fixed.

### apps/registry/src/api/routes/v1/skills-publish.ts

```ts
const verified = await verifyCliAuth(c.req.raw);
if (!verified) {
  return c.json({ error: "Unauthorized. Valid API key required." }, 401);
}
if (!hasRequiredScopes(verified.scopes, ["skills:publish"])) {
  return c.json({ error: "Forbidden. Token lacks required scope: skills:publish (or skills:admin)." }, 403);
}
```

The 403 OpenAPI description was widened from "Not a member of the org" to
"Token lacks skills:publish scope, or user is not a member of the org".

`skills-confirm.ts` and `auth.ts` (whoami) intentionally still call
`verifyCliAuth` without a scope check — those endpoints don't require
`skills:publish`. Their existing 401-on-null behavior is correct.

## Verification

```
$ bunx vitest run steps/system/web-publish-token-scopes.steps.ts
 Test Files  1 passed (1)
      Tests  4 passed (4)
```

Scenario results after fix:

- E1a (token with `skills:publish` scope) → 200 with uploadUrl/skillId/versionId.
- E1b (token with `skills:admin` scope) → 200 (admin implies publish).
- E1c (legacy NULL permissions) → 200 (backward-compat preserved).
- E3 (token with `skills:read` only) → 403 (NOT 401), with "Forbidden.
  Token lacks required scope: skills:publish (or skills:admin)."

Regression scope (related suites): 18/20 BDD scenarios pass against the
running registry. The 2 remaining failures
(`web-publish.steps.ts > fieldErrors` and
`web-publish.steps.ts > violations`) are pre-existing — they assert the API
returns `fieldErrors`/`violations` field names, but the production API has
since renamed those to `details`. Reproduced identically with `git stash`
applied to my fix; out of scope for this resolution and tracked separately.

## Recommendations (follow-ups, out of scope here)

1. **Scope `/api/v1/skills/confirm` to `skills:publish`.** Today the confirm
   step only checks authentication. A read-only token that somehow obtained
   a `versionId` (e.g. via DB inspection) could finalize a publish. Low risk
   in practice but tighten symmetric with the publish step.

2. **Stop writing the `skills:` prefix inside the permissions envelope.**
   The defensive `parseScopes` change makes the system tolerant of either
   shape, but `tokens.ts:createTokenFn` should still write the canonical
   `{ skills: ['publish'] }` form going forward to keep the storage clean.
   `normalizeScopes` should strip the prefix before passing to better-auth.

3. **Wire `@internal/bdd` into CI.** This bug shipped because BDD was
   excluded from `turbo run test`. Add a CI job that boots a real registry
   - Postgres + RustFS and runs the BDD suite. Without it, the regression
     surface this resolution exposed will reappear.

4. **Update `web-publish.steps.ts` E3/E6 assertions** to look for `details`
   instead of `fieldErrors`/`violations`. The API is stable; the tests are
   stale.

5. **Update `bdd/support/setup.ts`** to optionally mint scoped test users so
   the legacy publish-api tests can also exercise the scoped path, not only
   the legacy NULL path.
