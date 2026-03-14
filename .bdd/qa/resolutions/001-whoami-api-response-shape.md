# Resolution 001: Fix whoami API response shape mismatch

**Finding:** [001](../findings/001-whoami-api-response-shape.md)
**Date:** 2026-03-05
**Files changed:**

- `packages/mcp-server/src/lib/api-client.ts`
- `packages/mcp-server/__tests__/api-client.test.ts`

## Change

Updated `verifyAuth()` generic type parameter from:

```typescript
const result = await this.fetch<{ user: { name: string | null; email: string | null } }>('/api/v1/auth/whoami');
```

To:

```typescript
const result = await this.fetch<{ name: string | null; email: string | null; userId: string }>('/api/v1/auth/whoami');
```

And updated the return mapping from `result.data.user` to `{ name: result.data.name, email: result.data.email }`.

Also changed the return type to a discriminated union — see Resolution 002.

Updated unit test mock to return the correct response shape.

## Verification

- BDD auth.feature: 7/7 pass
- MCP unit tests: 28/28 pass
