# Resolution 002: Distinguish network errors from auth failures in verifyAuth

**Finding:** [002](../findings/002-whoami-network-error-indistinguishable.md)
**Date:** 2026-03-05
**Files changed:**
- `packages/mcp-server/src/lib/api-client.ts`
- `packages/mcp-server/src/tools/whoami.ts`

## Change

Changed `verifyAuth()` return type from `{ valid: boolean; user?: ... }` to a discriminated union:

```typescript
async verifyAuth(): Promise<
  | { valid: true; user: { name: string | null; email: string | null } }
  | { valid: false; reason: 'no-token' | 'unauthorized' | 'network-error'; error?: string }
>
```

Uses `result.status === 0` to detect network errors (the `fetch()` wrapper returns status 0 for caught exceptions).

Updated `whoami.ts` to check `authCheck.reason === 'network-error'` and return a connectivity error message.

## Verification

- BDD auth.feature "registry unreachable" scenario: PASS
- All 7 auth scenarios: PASS
