# Login Module

## Anchor

**Why this module exists:** The Tank CLI authenticates users via GitHub OAuth. Because the CLI is a terminal process, it cannot handle OAuth redirects directly — it delegates to the browser and polls for an authorized token. The module must securely bind the browser session to the CLI process using a CSRF `state` parameter, and write the resulting token to a local config file.

**Consumers:** CLI (`tank login` / `loginCommand()`), MCP server (`login` tool), web registry (browser login page).

**Single source of truth:** `packages/cli/src/commands/login.ts` (polling loop), `apps/registry-legacy/app/api/v1/cli-auth/` (start → authorize → exchange API routes), `apps/registry-legacy/lib/cli-auth-store.ts` (Redis session store).

---

## Layer 1: Structure

```
packages/cli/src/commands/login.ts             # CLI: POST start → open browser → poll exchange
apps/registry-legacy/app/api/v1/cli-auth/start/route.ts    # POST — create session, return authUrl + sessionCode
apps/registry-legacy/app/api/v1/cli-auth/authorize/route.ts # GET — browser auth callback, marks session as authorized
apps/registry-legacy/app/api/v1/cli-auth/exchange/route.ts  # POST — CLI polls; returns token when authorized
apps/registry-legacy/lib/cli-auth-store.ts             # Redis: session create/get/authorize/delete
packages/cli/src/lib/config.ts                 # Reads/writes ~/.tank/config.json
```

---

## Layer 2: Constraints

| #           | Rule                                                                                       | Rationale                                                       | Verified by  |
| ----------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------- | ------------ |
| C1          | `POST /cli-auth/start` requires a non-empty `state` string                                 | CSRF protection — state binds CLI to browser session            | BDD scenario |
| C2          | `POST /cli-auth/start` returns `authUrl` (browser URL) and `sessionCode` (CLI polling key) | These are the two halves of the auth handshake                  | BDD scenario |
| C3          | `POST /cli-auth/exchange` returns 400 while session is pending (not yet authorized)        | CLI must poll until authorized or timed out                     | BDD scenario |
| C4          | `POST /cli-auth/exchange` returns 200 with `token` + `user` once authorized                | Token is written to config by CLI after this step               | BDD scenario |
| C5          | Session expires after 5 minutes; `loginCommand` throws "Login timed out"                   | Prevents stale sessions accumulating in Redis                   | BDD scenario |
| C6          | Token is written to `~/.tank/config.json` (configurable via `--config-dir`)                | Token must persist across CLI invocations                       | BDD scenario |
| C7          | Exchange validates `state` matches what was passed to start                                | Prevents session fixation attacks                               | BDD scenario |
| C8          | Network errors during polling are swallowed; only non-transient errors throw               | Flaky networks during auth flow must not abort the CLI          | Code review  |
| C_browser_1 | Login page must render email/password form and social auth options                         | Users need visible, accessible auth entry points in the browser | BDD scenario |
| C_browser_2 | Unauthenticated users must be redirected to `/login` when accessing protected routes       | Enforces auth boundary at the browser level                     | BDD scenario |
| C_browser_3 | Successful login must redirect to dashboard                                                | Post-auth landing page; user expects to land somewhere useful   | BDD scenario |

---

## Layer 3: Examples

| #   | Input                                                   | Expected Output                                   |
| --- | ------------------------------------------------------- | ------------------------------------------------- |
| E1  | `POST /cli-auth/start` with valid state                 | 200: `{ authUrl, sessionCode }`                   |
| E2  | `POST /cli-auth/start` with missing state               | 400: `{ error: "Missing required field: state" }` |
| E3  | `POST /cli-auth/exchange` before authorization          | 400: session still pending                        |
| E4  | `POST /cli-auth/exchange` after simulated authorization | 200: `{ token, user }`                            |
| E5  | Exchange with mismatched state                          | 400 or 404: state validation failure              |
| E6  | Poll loop times out (deadline exceeded)                 | Error: "Login timed out. Please try again."       |
| E7  | Unauthenticated user navigates to `/dashboard`          | Redirected to `/login`                            |
| E8  | User visits `/login`                                    | Sees email/password form and social auth options  |
| E9  | User submits valid credentials on `/login`              | Redirected to `/dashboard`                        |
