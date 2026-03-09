# Engineering Principles

Inspired by [grugbrain.dev](https://grugbrain.dev/). Grug say: complexity very, very bad. Grug fight complexity with every mass of grug brain. These are the rules we actually follow, not aspirational nonsense nobody reads.

## Simplicity Over Cleverness

No resume-driven architecture. No microservices when a monorepo works fine.

- One PostgreSQL database. Not Postgres for auth, Redis for sessions, Mongo for packages, and Elasticsearch for search. One database.
- One monorepo. CLI, web, MCP server, scanner, shared types -- all in one repo, one CI pipeline, one lockfile. `pnpm install` and you are done.
- No dependency injection frameworks, no IoC containers, no service locators. Import the thing. Call the thing.
- When the problem is small, the solution should be small. A config file is JSON on disk. Not a database table, not a remote config service, not a YAML-with-templating engine.

## Boring Tech Wins

Pick technology that has a long track record of not exploding. New is not better. Proven is better.

- PostgreSQL `pg_trgm` for fuzzy search instead of deploying Elasticsearch. One `CREATE EXTENSION`, one GIN index, done.
- Drizzle ORM for queries. Not Prisma (too much magic), not raw SQL (too error-prone), not a hand-rolled query builder.
- Vitest for tests, Bun for runtime, Next.js for the web app. Popular, well-documented, easy to hire for.
- `better-auth` for authentication instead of rolling our own JWT validation, session management, and OAuth dance.

## One Thing Per File

If you want to find the install command, open `install.ts`. Not `commands/index.ts`, not `registry.ts`, not a barrel file that re-exports from six places.

- CLI: 18 commands, 18 files in `packages/cli/src/commands/`. One command, one file.
- MCP server: 15 tools, 15 files in `packages/mcp-server/src/tools/`. One tool, one file.
- Scanner: 6 stages, 6 files -- `stage0_ingest.py` through `stage5_supply.py`. One stage, one file.
- When you add a new command, you create a new file. You do not add a case to a switch statement in a god file.

## Explicitness Over Magic

If a reader has to run the code in their head to figure out what happens, it is too clever.

- Zod schemas validate at every boundary. API routes validate input with `safeParse()`. Never `parse()` -- that throws, and thrown exceptions are invisible control flow.
- Permissions are declared in `SKILL.json` manifests, not inferred at runtime. You can read what a skill does without executing it.
- Config is a JSON file at `~/.tank/config.json`. Not environment variable cascading, not a dotfile hierarchy, not "it checks twelve locations in priority order."
- No hidden middleware chains. Auth checks happen in layout components, visibly, not in some framework hook three layers deep.

## Build for Debugging

Every hour spent making errors debuggable saves ten hours of debugging.

- E2E tests spawn the real CLI binary and hit a real PostgreSQL database. Mocks lie. Real infrastructure tells the truth.
- `TANK_DEBUG=1` enables pino structured logs. No need to recompile, redeploy, or add print statements.
- Error messages say what went wrong AND what to do about it. "Missing DATABASE_URL" not "Connection failed." "Run `tank login` first" not "401 Unauthorized."
- The security scanner returns per-stage results with severity, line numbers, and evidence. Not just pass/fail.

## Minimal Abstraction

Three similar lines of code are better than a premature abstraction that saves two lines today and costs two hours tomorrow.

- Do not create a `utils/` folder for one function. Put the function where it is used.
- Add a shared helper on the third occurrence, not the first. First time: just write it. Second time: notice the duplication. Third time: extract it into `packages/shared/`.
- Every abstraction is a bet that future code will follow the same pattern. Most bets lose.

## Fix Minimally

When the building is on fire, put out the fire. Do not also repaint the walls.

- Never refactor while bugfixing. Fix the bug. Ship the fix. Open a separate PR for the refactor.
- Minimal diffs are easier to review, easier to revert, and easier to understand in `git blame` six months later.
- If a fix touches more than three files, question whether it is really a fix or a disguised refactor.

## Flat Over Nested

Deep directory trees are where knowledge goes to hide.

- `packages/cli/src/commands/install.ts` -- three levels. Not `packages/cli/src/features/install/commands/handlers/install-handler.ts` -- six levels.
- Route groups in the web app: `(auth)`, `(dashboard)`, `(admin)`, `(registry)`. Four groups. Not a folder per feature with sub-folders per concern.
- If you need a map to navigate your own project, you have too many folders.
