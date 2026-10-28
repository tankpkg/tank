# Login Module

## Anchor

**Why this module exists:** The Tank CLI authenticates users via GitHub OAuth. Because the CLI is a terminal process, it cannot handle OAuth redirects directly — it delegates to the browser and polls for an authorized token. The module must securely bind the browser session to the CLI process using a CSRF `state` parameter, and write the resulting token to a local config file.

**Consumers:** CLI (`tank login` / `loginCommand()`), MCP server (`login` tool), web registry (browser login page).

**Single source of truth:** `packages/cli/src/commands/login.ts` (polling loop), `apps/registry/src/api/routes/v1/cli-auth.ts` (start → authorize → exchange API routes), `apps/registry/src/lib/auth/cli-store.ts` (session store).

---

## Layer 1: Structure

```
packages/cli/src/commands/login.ts             # CLI: POST start → open browser → poll exchange
apps/registry/src/api/routes/v1/cli-auth.ts    # POST start, GET authorize, POST exchange — all in one Hono route file
apps/registry/src/lib/auth/cli-store.ts        # Session create/get/authorize/delete
packages/cli/src/lib/config.ts                 # Reads/writes ~/.tank/config.json
```

---

## Layer 2: Constraints

| #           | Rule                                                                                                                               | Rationale                                                                                                                                                            | Verified by  |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| C1          | `POST /cli-auth/start` requires a non-empty `state` string                                                                         | CSRF protection — state binds CLI to browser session                                                                                                                 | BDD scenario |
| C2          | `POST /cli-auth/start` returns `authUrl` (browser URL) and `sessionCode` (CLI polling key)                                         | These are the two halves of the auth handshake                                                                                                                       | BDD scenario |
| C3          | `POST /cli-auth/exchange` returns 400 while session is pending (not yet authorized)                                                | CLI must poll until authorized or timed out                                                                                                                          | BDD scenario |
| C4          | `POST /cli-auth/exchange` returns 200 with `token` + `user` once authorized                                                        | Token is written to config by CLI after this step                                                                                                                    | BDD scenario |
| C5          | Session expires after 5 minutes; `loginCommand` throws "Login timed out"                                                           | Prevents stale sessions accumulating in Redis                                                                                                                        | BDD scenario |
| C6          | Token is written to `~/.tank/config.json` (configurable via `--config-dir`)                                                        | Token must persist across CLI invocations                                                                                                                            | BDD scenario |
| C7          | Exchange validates `state` matches what was passed to start                                                                        | Prevents session fixation attacks                                                                                                                                    | BDD scenario |
| C8          | Network errors during polling are swallowed; only non-transient errors throw                                                       | Flaky networks during auth flow must not abort the CLI                                                                                                               | Code review  |
| C9          | `authUrl` returned by `/cli-auth/start` must use the live instance URL, not the frozen env default                                 | On-prem: `env.APP_URL` is frozen at module-load time (before DB bootstrap sets `process.env.APP_URL`). Using the frozen value returns `localhost:5555` to CLI users. | BDD scenario |
| C10         | When `APP_URL` is localhost on a selfhosted deployment, derive base URL from request `Host`/`X-Forwarded-Host` headers             | On-prem instances behind reverse proxies must self-heal even if `APP_URL` was never configured                                                                       | BDD scenario |
| C11         | A supported CLI's generated login request starts a session without weakening state validation                                      | Released CLI versions must remain compatible with the registry's authentication contract                                                                             | E2E test     |
| C12         | Unexpected start-session failures return a server error, not an invalid-request error, without exposing internal details           | A valid login request must not be blamed for a registry outage                                                                                                       | HTTP test    |
| C13         | PostgreSQL-backed email rate counters restart at one after their window expires                                                    | Switching the session store must not permanently block verification emails                                                                                           | BDD scenario |
| C14         | Concurrent exchanges of an authorized session succeed at most once on a consistent store primary                                   | Redis failover to a stale replica can restore a consumed session; this limitation is accepted                                                                        | BDD scenario |
| C15         | Pending sessions and authorized sessions with mismatched state are not consumed; authorization cannot resurrect a consumed session | Existing CLI polling and CSRF validation must remain safe under concurrent authorization and exchange                                                                | BDD scenario |
| C16         | PostgreSQL rate-window expiry and renewal use the PostgreSQL clock at the atomic update                                            | Application clock skew or a delayed database operation must not bypass email rate limits                                                                             | BDD scenario |
| C17         | In-progress CLI sessions created before the store-clock cutover are rejected; supported older CLI versions may start a new session | Legacy timestamps cannot prove their age under clock skew; unambiguous saved API tokens remain usable                                                                | BDD scenario |
| C18         | Unexpected authorization or exchange failures return a sanitized server error asking the user to start login again                 | A lost store response must not be mistaken for an ordinary pending login or expose connection details                                                                | HTTP/E2E     |
| C19         | New CLI sessions use a namespace that legacy replicas cannot read or mutate                                                        | A stale unconditional legacy write must not resurrect a consumed new session                                                                                         | BDD scenario |
| C_browser_1 | Login page must render email/password form and social auth options                                                                 | Users need visible, accessible auth entry points in the browser                                                                                                      | BDD scenario |
| C_browser_2 | Unauthenticated users must be redirected to `/login` when accessing protected routes                                               | Enforces auth boundary at the browser level                                                                                                                          | BDD scenario |
| C_browser_3 | Successful login must redirect to dashboard                                                                                        | Post-auth landing page; user expects to land somewhere useful                                                                                                        | BDD scenario |
| C_browser_4 | An authenticated browser can authorize the waiting CLI session and the CLI saves a usable token                                    | The real browser interaction and client hydration must complete the login flow                                                                                       | E2E test     |

---

## Layer 3: Examples

| #   | Input                                                                                                   | Expected Output                                                                  |
| --- | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| E1  | `POST /cli-auth/start` with valid state                                                                 | 200: `{ authUrl, sessionCode }`                                                  |
| E2  | `POST /cli-auth/start` with missing state                                                               | 400: `{ error: "Missing required field: state" }`                                |
| E3  | `POST /cli-auth/exchange` before authorization                                                          | 400: session still pending                                                       |
| E4  | `POST /cli-auth/exchange` after simulated authorization                                                 | 200: `{ token, user }`                                                           |
| E5  | Exchange with mismatched state                                                                          | 400 or 404: state validation failure                                             |
| E6  | Poll loop times out (deadline exceeded)                                                                 | Error: "Login timed out. Please try again."                                      |
| E7  | Unauthenticated user navigates to `/dashboard`                                                          | Redirected to `/login`                                                           |
| E8  | User visits `/login`                                                                                    | Sees email/password form and social auth options                                 |
| E9  | User submits valid credentials on `/login`                                                              | Redirected to `/dashboard`                                                       |
| E10 | `POST /cli-auth/start` on selfhosted with `APP_URL` set in DB                                           | `authUrl` starts with configured instance URL, not `localhost`                   |
| E11 | `POST /cli-auth/start` on selfhosted with `APP_URL` still defaulted, request via `Host: tank.acme.corp` | `authUrl` starts with `https://tank.acme.corp` (derived from request headers)    |
| E12 | A supported CLI starts browser login using its generated request                                        | A session is created and the CLI receives an authorization URL and session code  |
| E13 | A supported CLI starts login while the session store is unavailable                                     | A server error explains that login is unavailable; internal details stay private |
| E14 | An email rate-limit counter is incremented after its PostgreSQL window expires                          | The counter begins a new window at one                                           |
| E15 | Concurrent matching exchanges target the same authorized session in memory, Redis or PostgreSQL         | Exactly one exchange succeeds; all other exchanges return 400                    |
| E16 | An exchange targets a pending session or uses mismatched state                                          | It returns 400 without consuming the session; a later valid exchange succeeds    |
| E17 | Concurrent authorizations and an exchange target the same pending session                               | At most one authorization succeeds and a consumed session cannot reappear        |
| E18 | A new PostgreSQL rate window waits on a row lock longer than the window duration                        | Its expiry starts at the database update; the next increment returns two         |
| E19 | An authorized PostgreSQL session expires while its exchange is waiting for a row lock                   | The exchange returns 400 and does not issue a token                              |
| E20 | A pending or authorized session was created before the store-clock cutover                              | It is rejected; the user can start a fresh login with the same CLI               |
| E21 | A pending PostgreSQL session expires while authorization waits for its row lock                         | Authorization fails without reviving or extending the expired session            |
| E22 | An authenticated user clicks Authorize for a waiting CLI session in a browser                           | The browser confirms success and the CLI saves a token accepted by the registry  |
| E23 | A stored login session reaches its five-minute deadline before its atomic operation                     | Authorization or exchange fails without extending the session or issuing a token |
| E24 | A first PostgreSQL rate increment waits for a conflicting insert that rolls back                        | Its new window starts after contention, at one; the next increment returns two   |
| E25 | The session store is unavailable or cannot determine whether an exchange completed                      | Exchange returns a sanitized server error and asks the user to start login again |
| E26 | An authenticated user authorizes a session while the session store is unavailable                       | Authorization returns a sanitized server error and asks the user to start again  |
| E27 | A legacy replica writes a stale session after a new session with the same identifier is consumed        | The new session remains consumed and cannot issue another token                  |
