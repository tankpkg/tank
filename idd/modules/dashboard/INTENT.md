# Dashboard Module

## Anchor

**Why this module exists:** Authenticated users need a self-service interface to manage their API tokens — create, view, and revoke. Tokens are the credential used by the CLI and MCP server to authenticate API requests. The dashboard is the only place a token value is ever shown, and only at creation time.

**Consumers:** Web registry UI (browser), API token middleware.

**Single source of truth:**

- `Implemented: apps/registry/src/routes/dashboard/` — dashboard pages
- API routes for token CRUD

---

## Layer 1: Structure

```
apps/
  # Implemented: registry/src/routes/dashboard/  # Dashboard pages — token list, create, revoke
```

---

## Layer 2: Constraints

| #   | Rule                                                                    | Rationale                                                      | Verified by   |
| --- | ----------------------------------------------------------------------- | -------------------------------------------------------------- | ------------- |
| C1  | Dashboard requires authentication — redirect to `/login` if not authed  | Token management is a privileged operation                     | BDD scenario  |
| C2  | User can see a list of their API tokens (name, created date, last-used) | Overview of active credentials                                 | BDD scenario  |
| C3  | User can create a new API token with a name                             | Names distinguish tokens by purpose (e.g. "CI", "laptop")      | BDD scenario  |
| C4  | User can revoke an existing API token                                   | Credential rotation and breach response                        | BDD scenario  |
| C5  | Revoked tokens must no longer authenticate API requests                 | Revocation must be immediate and enforced server-side          | BDD assertion |
| C6  | Token value is shown only once at creation time                         | Tokens are secrets — cannot be retrieved after initial display | BDD assertion |

---

## Layer 3: Examples

| #   | Input                                          | Expected Output                                                    |
| --- | ---------------------------------------------- | ------------------------------------------------------------------ |
| E1  | Unauthenticated user navigates to `/dashboard` | Redirected to `/login`                                             |
| E2  | Authenticated user visits `/dashboard`         | Sees list of their tokens (or empty state if none)                 |
| E3  | User creates a token named "CI"                | Token value displayed once; token appears in list with name "CI"   |
| E4  | User revokes token "CI"                        | Token removed from list; subsequent API calls with that token fail |
| E5  | User creates two tokens, revokes one           | Only the revoked token is invalid; the other continues to work     |
