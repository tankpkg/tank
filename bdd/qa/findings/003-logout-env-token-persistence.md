# Finding 003: Logout doesn't clear TANK_TOKEN environment variable

**Date:** 2026-03-05
**Feature:** auth.feature — Scenario: Agent clears credentials when user is authenticated
**Severity:** Bug (application code)

## Symptom

After calling `logout`, subsequent authenticated tool calls would still succeed because `getConfig()` checks `process.env.TANK_TOKEN` after reading the file — re-discovering the token that was just "cleared" from disk.

## Root Cause

`logout.ts` called `setConfig({ token: undefined })` which correctly removed the token from `~/.tank/config.json`. However, `getConfig()` also checks `process.env.TANK_TOKEN` as an override. Since the MCP server process was started with `TANK_TOKEN` in its environment, the env-based token survived the logout.

## Resolution

Added `delete process.env.TANK_TOKEN` to `logout.ts` after clearing the file-based token, ensuring subsequent `getConfig()` calls in the same process don't re-discover it.

See: [resolution 003](../resolutions/003-logout-env-token.md)
