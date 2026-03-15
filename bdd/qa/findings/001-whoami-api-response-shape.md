# Finding 001: Whoami API response shape mismatch

**Date:** 2026-03-05
**Feature:** auth.feature — Scenario: Agent retrieves identity when user is authenticated
**Severity:** Bug (application code)

## Symptom

`whoami` MCP tool returned `"Logged in as unknown\nEmail: unknown"` despite the user being authenticated with valid credentials.

## Root Cause

The `/api/v1/auth/whoami` endpoint returns `{ name, email, userId }` at the **top level**, but `TankApiClient.verifyAuth()` expected the response shape `{ user: { name, email } }` — a nested `user` object.

This caused `result.data.user` to be `undefined`, so `name` and `email` fell through to the `?? 'unknown'` defaults.

## Resolution

Fixed in `packages/mcp-server/src/lib/api-client.ts` — updated `verifyAuth()` to match the actual API response shape: `{ name: string | null; email: string | null; userId: string }`.

See: [resolution 001](../resolutions/001-whoami-api-response-shape.md)
