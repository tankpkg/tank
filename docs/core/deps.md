# Dependencies

High-signal stack map. Use package references for package-specific detail.

## Runtime Stack

- Languages: TypeScript, TSX, Python, MDX, SQL, Shell, YAML
- JS runtime: Bun (workspace manager), Node 24 (production/runtime containers)
- Python runtime: Python + uv
- Monorepo: Turbo + Bun workspaces + tsdown

## Active Surfaces

| Workspace                    | Role                | Primary stack                                  |
| ---------------------------- | ------------------- | ---------------------------------------------- |
| `apps/registry`              | registry app        | TanStack Start, TanStack Router, Hono, Drizzle |
| `apps/python-api`            | scanner API         | FastAPI, Pydantic                              |
| `packages/cli`               | `tank` CLI          | Commander, Zod                                 |
| `packages/mcp-server`        | editor integration  | MCP SDK                                        |
| `packages/internals-schemas` | shared contracts    | Zod                                            |
| `packages/internals-helpers` | shared pure helpers | TypeScript                                     |

## Infra Notes

- Supabase = storage only, not application queries.
- PostgreSQL + Drizzle = database layer.
- Better Auth = auth/session/API key layer.
- Browser tests use Playwright; behavior tests also use Vitest.
- TanStack Start is the sole web surface.
