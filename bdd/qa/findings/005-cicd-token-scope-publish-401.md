# Finding: CI/CD Tokens with Scopes Fail Publish with 401

**Date:** 2026-04-28
**Reported by:** User on a real Tank instance running `tank publish` in
GitHub Actions.
**Severity:** High — the publish flow is unusable for any user who creates a
scoped CI/CD token via the dashboard. The CLI shows a misleading
"Authentication failed" message, prompting users to re-login (which does not
help; the token is valid, the scope check is broken).

## Symptom

```
$ tank publish
Authentication failed. Your token may be expired or invalid. Run: tank login
```

But:

```
$ tank whoami
Logged in as: <user>
```

The token was generated via the dashboard with the "Publish only" preset
(scope `skills:publish`). The same behavior reproduces with `skills:admin`.

## Reproduction (real system, no mocks)

1. Run a clean Tank stack: `just docker up && just db push`, then start the
   registry on `:5555`.
2. Create a Tank user with an `apikey` row whose `permissions` column is the
   exact JSON the dashboard writes:
   ```json
   { "skills": ["skills:publish"] }
   ```
3. `curl -X POST $REGISTRY/api/v1/skills -H "Authorization: Bearer $KEY" \
-H "Content-Type: application/json" \
-d '{"manifest":{"name":"@org/x","version":"1.0.0","description":"x"}}'`
4. Response: `401 Unauthorized. Valid API key with skills:publish scope required.`

The new BDD suite `bdd/features/system/web-publish/api-token-scopes.feature`
captures this with four scenarios:

- E1a: `skills:publish` token must publish.
- E1b: `skills:admin` token must publish.
- E1c: legacy NULL-permissions token must continue to work.
- E3: `skills:read`-only token must be rejected with **403, not 401**.

## Root cause (two compounding bugs)

### Bug 1 — Storage/parse format mismatch

`apps/registry/src/lib/auth/tokens.ts:55` writes API key permissions as:

```ts
permissions: {
  skills: normalizedScopes;
} // normalizedScopes = ['skills:publish']
```

The `skills:` prefix is INSIDE the array. `parseScopes` in `authz.ts` then
prepends `${resource}:` to every element, producing
`['skills:skills:publish']`. The publish route requires `['skills:publish']`,
which is never present in that set. The scope check fails for every scoped
token.

### Bug 2 — 401 conflated with 403

`verifyCliAuth(req, requiredScopes)` returned `null` whether the failure was:

- missing/invalid token (rightly 401)
- valid token, missing scope (should be 403)
- blocked or disabled user (rightly 401)

`skills-publish.ts` returned 401 in all cases. The CLI maps a publish-endpoint
401 to "Run: tank login" — wrong advice for a scope-deficient token, and
masking the real cause.

## Why this shipped undetected

1. `@internal/bdd` is excluded from CI (`turbo run test --filter='!@internal/bdd'`),
   so the existing legacy `publish-api.feature` — which would have caught
   the auth break — never ran.
2. The legacy fixture in `bdd/support/setup.ts` inserts apikey rows WITHOUT a
   `permissions` column (NULL). `parseScopes(null)` returns `[]`, and
   `hasRequiredScopes` treats empty granted scopes as legacy unrestricted
   (intentional backward-compat). So the legacy test path bypassed the bug
   surface entirely.
3. No scenario tested a positive scope case (E1a/E1b) until this work.

## Resolution

See `bdd/qa/resolutions/008-cicd-token-scope-publish-401.md`.
