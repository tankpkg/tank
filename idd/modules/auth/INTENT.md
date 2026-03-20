# Auth Module (whoami / logout)

## Anchor

**Why this module exists:** After `tank login` writes a token to `~/.tank/config.json`,
subsequent commands need to verify and display the current identity (`whoami`) and
invalidate the local session (`logout`). These are identity inspection and session
management primitives that every authenticated CLI workflow depends on.

**Consumers:** CLI (`tank whoami`, `tank logout`), MCP server (`whoami`, `logout` tools).
The MCP tools are the primary test target.

**Single source of truth:**

- `packages/cli/src/commands/whoami.ts` — `whoamiCommand()`
- `packages/cli/src/commands/logout.ts` — `logoutCommand()`
- `packages/mcp-server/src/tools/whoami.ts`, `logout.ts` — MCP wrappers
- `TODO: port to apps/registry/src/api/routes/v1/whoami.ts` — server-side identity endpoint

---

## Layer 1: Structure

```
packages/
  cli/src/commands/whoami.ts              # whoamiCommand() — reads token, calls /api/v1/auth/whoami
  cli/src/commands/logout.ts             # logoutCommand() — deletes token + user from config
  mcp-server/src/tools/whoami.ts         # MCP wrapper
  mcp-server/src/tools/logout.ts         # MCP wrapper
TODO: port to apps/registry/src/api/routes/v1/whoami.ts  # GET — returns user info for valid token
```

---

## Layer 2: Constraints

| #   | Rule                                                                                              | Rationale                                                                  | Verified by   |
| --- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ------------- |
| C1  | `whoami` verifies the token against the server's `/api/v1/auth/whoami` endpoint                   | Local config can be stale; server-side check confirms token is still valid | BDD scenario  |
| C2  | `whoami` response includes the user's name and email                                              | Identity display — the user needs to know who they are logged in as        | BDD assertion |
| C3  | `whoami` with no token returns "not logged in" or equivalent message                              | Unauthenticated state must be clearly communicated                         | BDD scenario  |
| C4  | `whoami` with an invalid/expired token returns a clear auth failure message                       | Stale tokens must prompt re-login                                          | BDD scenario  |
| C5  | `logout` clears the token from `~/.tank/config.json`                                              | After logout, subsequent commands must not use the old token               | BDD assertion |
| C6  | `logout` clears the user from `~/.tank/config.json`                                               | User info should not persist after logout                                  | BDD assertion |
| C7  | `logout` clears `TANK_TOKEN` environment variable if set                                          | QA Finding 003 — env var token must not persist across logout              | BDD assertion |
| C8  | `whoami` response shape from server: `{ user: { name, email } }` — not `{ name, email }` directly | QA Finding 001 — response must be unwrapped correctly                      | BDD assertion |
| C9  | Network errors in `whoami` are reported distinctly from auth failures                             | QA Finding 002 — "server unreachable" ≠ "token invalid"                    | BDD scenario  |
| C10 | After `logout`, `whoami` reports "not logged in"                                                  | Logout must invalidate subsequent identity checks                          | BDD scenario  |

---

## Layer 3: Examples

| #   | Input                                                   | Expected Output                                               |
| --- | ------------------------------------------------------- | ------------------------------------------------------------- |
| E1  | `whoami` with valid token                               | Returns name and email of logged-in user; no error            |
| E2  | `whoami` with no token in config                        | Reports "not logged in" or "not authenticated" message        |
| E3  | `whoami` with revoked/expired token                     | Reports auth failure; prompts `tank login`                    |
| E4  | `logout` when logged in                                 | Config file no longer contains token or user fields           |
| E5  | `whoami` after `logout`                                 | Reports "not logged in"                                       |
| E6  | `whoami` with `TANK_TOKEN` env var set to invalid token | Reports auth failure (env var token validated against server) |
| E7  | `logout` with `TANK_TOKEN` env var set                  | Env var is cleared; subsequent whoami reports "not logged in" |
| E8  | `whoami` when server unreachable                        | Reports network error, NOT "token invalid"                    |
