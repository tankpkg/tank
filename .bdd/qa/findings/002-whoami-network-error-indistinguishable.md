# Finding 002: Network errors indistinguishable from auth failures

**Date:** 2026-03-05
**Feature:** auth.feature — Scenario: Agent retrieves identity when the registry is unreachable
**Severity:** Bug (application code)

## Symptom

When the registry was unreachable, the `whoami` tool returned `"Session expired or invalid"` instead of a connectivity error message.

## Root Cause

`TankApiClient.verifyAuth()` returned `{ valid: false }` for ALL failure cases — both network errors (status 0) and auth rejections (status 401). The `whoami` tool had no way to distinguish between them.

## Resolution

Changed `verifyAuth()` to return a discriminated union with a `reason` field:
- `{ valid: true, user: {...} }` — success
- `{ valid: false, reason: 'no-token' }` — no credentials
- `{ valid: false, reason: 'unauthorized' }` — rejected by server
- `{ valid: false, reason: 'network-error', error: string }` — connectivity failure

See: [resolution 002](../resolutions/002-whoami-network-error.md)
