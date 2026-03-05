# Resolution 003: Clear TANK_TOKEN env var on logout

**Finding:** [003](../findings/003-logout-env-token-persistence.md)
**Date:** 2026-03-05
**Files changed:**
- `packages/mcp-server/src/tools/logout.ts`

## Change

Added `delete process.env.TANK_TOKEN` after `setConfig({ token: undefined })`:

```typescript
setConfig({ token: undefined, user: undefined });
delete process.env.TANK_TOKEN;
```

This ensures that subsequent `getConfig()` calls in the same MCP server process don't re-discover the token from the environment after it was intentionally cleared.

## Verification

- BDD auth.feature "logout then authenticated tools rejected" scenario: PASS
- All 7 auth scenarios: PASS
