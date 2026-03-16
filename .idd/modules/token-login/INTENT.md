# Token Login Module

## Anchor

**Why this module exists:** The CLI's browser-based OAuth login flow breaks in
corporate environments — proxies block callbacks, security teams won't register
OAuth apps for internal tools, and headless CI has no browser. A token-based login
lets users authenticate by pasting a pre-generated API token, skipping the browser
entirely. This is how npm, pip, and every enterprise artifact registry handles CLI auth.

**Consumers:** CLI (`tank login --token`), MCP server (`login` tool with token param).

**Single source of truth:**

- `packages/cli/src/commands/login.ts` — `--token` flag handling
- `packages/mcp-server/src/tools/login.ts` — token param in MCP login tool
- `packages/web/app/api/v1/auth/whoami/route.ts` — token validation endpoint

---

## Layer 1: Structure

```
packages/
  cli/src/commands/login.ts                   # --token flag: validate → save to config
  cli/src/lib/config.ts                       # writeConfig() — saves token + user
  mcp-server/src/tools/login.ts               # MCP login with token param
web/app/api/v1/auth/whoami/route.ts           # GET — validates Bearer token, returns user
```

---

## Layer 2: Constraints

| #   | Rule                                                                                  | Rationale                                                               | Verified by  |
| --- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ------------ |
| C1  | `tank login --token <token>` validates the token against `/api/v1/auth/whoami`        | Token must be confirmed valid before saving — fail fast, not fail later | BDD scenario |
| C2  | On successful validation, token + user info saved to `~/.tank/config.json`            | Identical persistence path as browser login — commands work the same    | BDD scenario |
| C3  | On validation failure (401/403), shows error with registry dashboard URL              | User needs to know where to generate a new token                        | BDD scenario |
| C4  | `--token` and browser flow are mutually exclusive — `--token` skips all browser logic | No ambiguity about which flow runs                                      | BDD scenario |
| C5  | `--token` works when `TANK_REGISTRY` points to a custom on-prem registry              | Enterprise users will have non-default registry URLs                    | BDD scenario |
| C6  | MCP `login` tool accepts an optional `token` parameter with identical behavior        | Editor integration must offer the same escape hatch                     | BDD scenario |
| C7  | Token is not logged or echoed back to the terminal after saving                       | Credentials must not leak to terminal history or log aggregators        | Code review  |
| C8  | If `--token` is passed as empty string, show usage error (not a network call)         | Prevent accidental empty-token validation calls                         | BDD scenario |

---

## Layer 3: Examples

| #   | Input                                                     | Expected Output                                                          |
| --- | --------------------------------------------------------- | ------------------------------------------------------------------------ |
| E1  | `tank login --token tank_valid123`                        | Validates against server; saves token + user to config; "Logged in as X" |
| E2  | `tank login --token tank_expired`                         | 401 from server; "Invalid or expired token. Generate at {registry}/..."  |
| E3  | `tank login --token tank_revoked`                         | 401 from server; same error message as E2                                |
| E4  | `tank login --token ""`                                   | Local error: "Token cannot be empty"; no network call                    |
| E5  | `tank login --token tank_valid` with custom registry      | Validates against custom registry URL; saves correctly                   |
| E6  | `tank whoami` after `tank login --token tank_valid123`    | Returns same user info as if logged in via browser                       |
| E7  | MCP `login` tool with `{ token: "tank_valid123" }`        | Same behavior as CLI E1                                                  |
| E8  | `tank login --token tank_valid123` when already logged in | Overwrites existing token; "Logged in as X (was Y)"                      |
