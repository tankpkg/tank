# Dependencies

npm: `npmjs.com/package/{name}` · pypi: `pypi.org/project/{name}`

> When updating a dep, check for updated llms.txt / llms-full.txt at the dep's docs site.

## Stack

- **Languages**: TypeScript, TSX, Python, MDX, SQL, Shell, YAML
- **JS Runtime**: Bun (workspaces + package manager), Node 24 (production containers)
- **Python Runtime**: Python 3.12+ (scanner), uv (package manager)
- **Monorepo**: Turbo, Bun workspaces, tsdown builds

## Workspaces

| Workspace                    | Role                              | Framework                             |
| ---------------------------- | --------------------------------- | ------------------------------------- |
| `apps/web`                   | primary registry, API, docs       | Next.js, React, Fumadocs              |
| `apps/web-astro`             | alternate Astro implementation    | Astro, Hono, React                    |
| `apps/web-tanstack`          | alternate TanStack implementation | TanStack Start, TanStack Router, Hono |
| `apps/python-api`            | security scanner                  | FastAPI, Pydantic                     |
| `packages/cli`               | `tank` CLI                        | Commander                             |
| `packages/mcp-server`        | editor integration                | MCP SDK                               |
| `packages/internals-schemas` | shared Zod schemas + types        | Zod                                   |
| `packages/internals-helpers` | shared pure helpers               | semver                                |

Note: Supabase = file storage only. DB = Drizzle ORM → PostgreSQL.

## Frameworks & Runtime

- **next** — web framework [web] — [docs](https://nextjs.org/docs) · [gh](https://github.com/vercel/next.js)
- **react**, **react-dom** — UI library [web, astro, tanstack] — [docs](https://react.dev) · [gh](https://github.com/facebook/react)
- **astro** — web framework [astro] — [docs](https://docs.astro.build) · [gh](https://github.com/withastro/astro)
- **@astrojs/node** — Node adapter [astro] — [docs](https://docs.astro.build/en/guides/integrations-guide/node/)
- **@astrojs/react** — React integration [astro] — [docs](https://docs.astro.build/en/guides/integrations-guide/react/)
- **@astrojs/mdx** — MDX integration [astro] — [docs](https://docs.astro.build/en/guides/integrations-guide/mdx/)
- **@tanstack/react-start** — full-stack framework [tanstack] — [docs](https://tanstack.com/start)
- **@tanstack/react-router** — type-safe routing [tanstack] — [docs](https://tanstack.com/router)
- **@tanstack/react-router-devtools** — Router devtools [tanstack] — [docs](https://tanstack.com/router)
- **@tanstack/react-router-ssr-query** — SSR + Query bridge [tanstack] — [docs](https://tanstack.com/router)
- **@tanstack/router-plugin** — Router build plugin [tanstack] — [docs](https://tanstack.com/router)
- **@tanstack/react-query** — async state management [tanstack] — [docs](https://tanstack.com/query)
- **@tanstack/react-query-devtools** — Query devtools [tanstack] — [docs](https://tanstack.com/query)
- **@tanstack/react-devtools** — unified TanStack devtools [tanstack] — [docs](https://tanstack.com/devtools)
- **@tanstack/react-hotkeys** — keyboard shortcuts [tanstack] — [docs](https://tanstack.com/hotkeys)
- **@tanstack/react-pacer** — debounce/throttle utilities [tanstack] — [docs](https://tanstack.com/pacer)
- **hono** — lightweight web framework/router [astro, tanstack] — [docs](https://hono.dev) · [gh](https://github.com/honojs/hono)
- **@hono/zod-validator** — Zod validation middleware [astro, tanstack] — [gh](https://github.com/honojs/middleware)
- **nitro** — server engine [tanstack] — [gh](https://github.com/unjs/nitro)
- **vite** — build tool [tanstack] — [docs](https://vite.dev) · [gh](https://github.com/vitejs/vite)
- **@vitejs/plugin-react** — Vite React plugin [tanstack] — [gh](https://github.com/vitejs/vite-plugin-react)

## Data & Auth

- **better-auth** — auth framework [web, astro, tanstack] — [docs](https://www.better-auth.com/docs) · [gh](https://github.com/better-auth/better-auth)
- **@better-auth/api-key** — API key plugin [web, astro, tanstack] — [docs](https://www.better-auth.com/docs/plugins/api-key)
- **drizzle-orm** — TypeScript ORM [web, astro, tanstack] — [docs](https://orm.drizzle.team) · [gh](https://github.com/drizzle-team/drizzle-orm)
- **drizzle-kit** — migration toolkit [web, astro, tanstack] — [docs](https://orm.drizzle.team/docs/kit-overview) · [gh](https://github.com/drizzle-team/drizzle-orm)
- **postgres** — PostgreSQL driver [root, web, astro, tanstack] — [gh](https://github.com/porsager/postgres)
- **@supabase/supabase-js** — Supabase storage client (storage only, not DB) [web, astro, tanstack] — [docs](https://supabase.com/docs) · [gh](https://github.com/supabase/supabase-js)
- **ioredis** — Redis client [web, astro, tanstack] — [gh](https://github.com/redis/ioredis)
- **@aws-sdk/client-s3** — S3 storage [web, astro, tanstack] — [docs](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/) · [gh](https://github.com/aws/aws-sdk-js-v3)
- **@aws-sdk/s3-request-presigner** — S3 presigned URLs [web, astro, tanstack] — [gh](https://github.com/aws/aws-sdk-js-v3)
- **nodemailer** — email sending [web, astro, tanstack] — [docs](https://nodemailer.com) · [gh](https://github.com/nodemailer/nodemailer)
- **zustand** — client state management [tanstack] — [docs](https://zustand.docs.pmnd.rs) · [gh](https://github.com/pmndrs/zustand)
- **axios** — HTTP client [astro, tanstack] — [docs](https://axios-http.com) · [gh](https://github.com/axios/axios)

## UI & Styling

- **tailwindcss** — utility-first CSS [web, astro, tanstack] — [docs](https://tailwindcss.com) · [gh](https://github.com/tailwindlabs/tailwindcss)
- **@tailwindcss/postcss** — Tailwind PostCSS plugin [web] — [gh](https://github.com/tailwindlabs/tailwindcss)
- **@tailwindcss/vite** — Tailwind Vite plugin [astro, tanstack] — [gh](https://github.com/tailwindlabs/tailwindcss)
- **@tailwindcss/typography** — prose styling [web, astro, tanstack] — [gh](https://github.com/tailwindlabs/tailwindcss-typography)
- **radix-ui** — headless UI primitives [web, astro, tanstack] — [docs](https://www.radix-ui.com/primitives) · [gh](https://github.com/radix-ui/primitives)
- **shadcn** — component CLI [web, astro, tanstack] — [docs](https://ui.shadcn.com) · [gh](https://github.com/shadcn-ui/ui)
- **lucide-react** — icon set [web, astro, tanstack] — [docs](https://lucide.dev) · [gh](https://github.com/lucide-icons/lucide)
- **class-variance-authority** — variant styling [web, astro, tanstack] — [gh](https://github.com/joe-bell/cva)
- **clsx** — conditional class strings [web, astro, tanstack] — [gh](https://github.com/lukeed/clsx)
- **tailwind-merge** — Tailwind class deduplication [web, astro, tanstack] — [gh](https://github.com/dcastil/tailwind-merge)
- **cmdk** — command palette [web, astro, tanstack] — [gh](https://github.com/pacocoursey/cmdk)
- **tw-animate-css** — Tailwind animation utilities [web, astro, tanstack] — [gh](https://github.com/Wombosvideo/tw-animate-css)
- **motion** — animation library [tanstack] — [docs](https://motion.dev) · [gh](https://github.com/motiondivision/motion)
- **@fontsource-variable/geist** — Geist variable font [tanstack] — [gh](https://github.com/fontsource/fontsource)
- **vanilla-cookieconsent** — cookie consent banner [web, astro] — [docs](https://cookieconsent.orestbida.com) · [gh](https://github.com/orestbida/cookieconsent)
- **postcss** — CSS processing [web] — [docs](https://postcss.org) · [gh](https://github.com/postcss/postcss)
- **sharp** — image processing [astro] — [docs](https://sharp.pixelplumbing.com) · [gh](https://github.com/lovell/sharp)

## Markdown & Content

- **fumadocs-core** — docs framework core [web] — [docs](https://fumadocs.dev) · [gh](https://github.com/fuma-nama/fumadocs)
- **fumadocs-mdx** — MDX source plugin [web] — [docs](https://fumadocs.dev) · [gh](https://github.com/fuma-nama/fumadocs)
- **fumadocs-ui** — docs UI components [web] — [docs](https://fumadocs.dev) · [gh](https://github.com/fuma-nama/fumadocs)
- **react-markdown** — markdown rendering [web, astro] — [gh](https://github.com/remarkjs/react-markdown)
- **rehype-raw** — raw HTML in markdown [web, astro] — [gh](https://github.com/rehypejs/rehype-raw)
- **rehype-sanitize** — HTML sanitization [web, astro] — [gh](https://github.com/rehypejs/rehype-sanitize)
- **remark-gfm** — GitHub Flavored Markdown [web, astro] — [gh](https://github.com/remarkjs/remark-gfm)
- **modern-tar** — tarball operations [web, astro] — [gh](https://github.com/ayuhito/modern-tar)
- **pako** — gzip compression [web, astro] — [gh](https://github.com/nodeca/pako)

## CLI Tooling

- **commander** — CLI framework [cli] — [gh](https://github.com/tj/commander.js)
- **@inquirer/prompts** — interactive prompts [cli] — [gh](https://github.com/SBoudrias/Inquirer.js)
- **chalk** — terminal colors [cli] — [gh](https://github.com/chalk/chalk)
- **ora** — terminal spinners [cli] — [gh](https://github.com/sindresorhus/ora)
- **open** — open URLs in browser [cli] — [gh](https://github.com/sindresorhus/open)
- **ignore** — gitignore matching [cli, mcp] — [gh](https://github.com/kaelzhang/node-ignore)
- **semver** — semver parsing [cli, mcp, helpers] — [gh](https://github.com/npm/node-semver)
- **tar** — tarball creation [cli, mcp] — [gh](https://github.com/isaacs/node-tar)
- **zod** — schema validation [cli, mcp, schemas] — [docs](https://zod.dev) · [gh](https://github.com/colinhacks/zod)

## MCP & Protocol

- **@modelcontextprotocol/sdk** — MCP protocol SDK [mcp] — [docs](https://modelcontextprotocol.io) · [gh](https://github.com/modelcontextprotocol/typescript-sdk)

## Security Scanning (Python)

- **fastapi** — web framework — [docs](https://fastapi.tiangolo.com) · [gh](https://github.com/fastapi/fastapi)
- **pydantic** — data models — [docs](https://docs.pydantic.dev) · [gh](https://github.com/pydantic/pydantic)
- **httpx** — HTTP client — [docs](https://www.python-httpx.org) · [gh](https://github.com/encode/httpx)
- **uvicorn** — ASGI server — [docs](https://www.uvicorn.org) · [gh](https://github.com/encode/uvicorn)
- **psycopg** — PostgreSQL adapter — [docs](https://www.psycopg.org/psycopg3/) · [gh](https://github.com/psycopg/psycopg)
- **charset-normalizer** — encoding detection — [gh](https://github.com/jawah/charset_normalizer)
- **bandit** — Python security linter — [docs](https://bandit.readthedocs.io) · [gh](https://github.com/PyCQA/bandit)
- **skill-scanner** — Cisco AI defense scanner — [gh](https://github.com/cisco-ai-defense/skill-scanner)
- **detect-secrets** — secrets detection — [gh](https://github.com/Yelp/detect-secrets)
- **pip-audit** — dependency vulnerability audit — [gh](https://github.com/pypa/pip-audit)
- **sarif-om** — SARIF output format — [gh](https://github.com/microsoft/sarif-python-om)
- **jschema-to-python** — JSON schema conversion — [pypi](https://pypi.org/project/jschema-to-python/)

## Observability & Analytics

- **pino** — logger [web, astro, cli] — [docs](https://getpino.io) · [gh](https://github.com/pinojs/pino)
- **pino-loki** — Loki log shipping [web, astro, cli] — [gh](https://github.com/Julien-R44/pino-loki)
- **posthog-js** — product analytics [web, astro] — [docs](https://posthog.com/docs/libraries/js) · [gh](https://github.com/PostHog/posthog-js)

## Build & Dev Tooling

- **typescript** — type checker [root] — [docs](https://www.typescriptlang.org) · [gh](https://github.com/microsoft/TypeScript)
- **turbo** — monorepo orchestrator [root] — [docs](https://turborepo.dev/docs) · [gh](https://github.com/vercel/turborepo)
- **tsdown** — TS build tool [root, cli, mcp] — [docs](https://tsdown.dev) · [gh](https://github.com/rolldown/tsdown)
- **esbuild** — JS bundler [cli] — [gh](https://github.com/evanw/esbuild)
- **tsx** — TypeScript execution [mcp] — [docs](https://tsx.is) · [gh](https://github.com/privatenumber/tsx)
- **@biomejs/biome** — linter + formatter [root] — [docs](https://biomejs.dev) · [gh](https://github.com/biomejs/biome)
- **prettier** — code formatter (md, yaml, feature files) [root] — [docs](https://prettier.io) · [gh](https://github.com/prettier/prettier)
- **prettier-plugin-gherkin** — Gherkin formatting [root] — [gh](https://github.com/mapado/prettier-plugin-gherkin)
- **vitest** — test runner [all TS packages] — [docs](https://vitest.dev) · [gh](https://github.com/vitest-dev/vitest)
- **@playwright/test** — browser testing [root] — [docs](https://playwright.dev) · [gh](https://github.com/microsoft/playwright)
- **playwright-bdd** — BDD for Playwright [root] — [gh](https://github.com/vitalets/playwright-bdd)
- **vite-tsconfig-paths** — Vite TS path resolution [tanstack] — [gh](https://github.com/aleclarson/vite-tsconfig-paths)
- **jsdom** — test DOM environment [tanstack] — [gh](https://github.com/jsdom/jsdom)
- **babel-plugin-react-compiler** — React compiler [astro] — [docs](https://react.dev/learn/react-compiler)
- **react-doctor** — React perf diagnostics [web] — [gh](https://github.com/aidenybai/react-doctor)
- **@tsconfig/bun** — TS config base for Bun [root] — [gh](https://github.com/tsconfig/bases)
- **@types/bun** — Bun type definitions [root] — [gh](https://github.com/DefinitelyTyped/DefinitelyTyped)
- **@types/node** — Node.js type definitions [web, astro, tanstack, cli, mcp] — [gh](https://github.com/DefinitelyTyped/DefinitelyTyped)
- **@types/react** — React type definitions [web, astro, tanstack] — [gh](https://github.com/DefinitelyTyped/DefinitelyTyped)
- **@types/react-dom** — React DOM type definitions [web, astro, tanstack] — [gh](https://github.com/DefinitelyTyped/DefinitelyTyped)
- **@types/nodemailer** — Nodemailer types [web, astro] — [gh](https://github.com/DefinitelyTyped/DefinitelyTyped)
- **@types/pako** — Pako types [web, astro] — [gh](https://github.com/DefinitelyTyped/DefinitelyTyped)
- **@types/pg** — PostgreSQL types [web, astro] — [gh](https://github.com/DefinitelyTyped/DefinitelyTyped)
- **@types/tar** — Tar types [cli] — [gh](https://github.com/DefinitelyTyped/DefinitelyTyped)
- **@types/semver** — Semver types [helpers] — [gh](https://github.com/DefinitelyTyped/DefinitelyTyped)
- **@types/mdx** — MDX types [web] — [gh](https://github.com/DefinitelyTyped/DefinitelyTyped)
- **pytest** — Python test framework [scanner] — [docs](https://docs.pytest.org) · [gh](https://github.com/pytest-dev/pytest)
- **pytest-asyncio** — async test support [scanner] — [gh](https://github.com/pytest-dev/pytest-asyncio)
- **ruff** — Python linter/formatter [scanner] — [docs](https://docs.astral.sh/ruff/) · [gh](https://github.com/astral-sh/ruff)
- **pyright** — Python type checker [scanner] — [docs](https://microsoft.github.io/pyright/) · [gh](https://github.com/microsoft/pyright)

## Infrastructure

- **PostgreSQL** — primary database — [docs](https://www.postgresql.org/docs/) · [gh](https://github.com/postgres/postgres)
- **Redis** — caching + rate limiting — [docs](https://redis.io/docs/) · [gh](https://github.com/redis/redis)
- **MinIO** — S3-compatible object storage — [docs](https://min.io/docs/) · [gh](https://github.com/minio/minio)
- **Ollama** — optional local LLM inference — [docs](https://ollama.com) · [gh](https://github.com/ollama/ollama)
- **Grafana** — observability dashboards — [docs](https://grafana.com/docs/) · [gh](https://github.com/grafana/grafana)
- **Loki** — log aggregation — [docs](https://grafana.com/docs/loki/) · [gh](https://github.com/grafana/loki)

Docker images: `oven/bun:1`, `node:24-alpine`, `python:3.14-alpine`, `ghcr.io/astral-sh/uv:latest`
Compose services: `postgres:17-alpine`, `redis:7-alpine`, `minio/minio:latest`, `ollama/ollama:latest`
Production targets: `ghcr.io/tankpkg/tank-web`, `ghcr.io/tankpkg/tank-scanner`
Helm subcharts: Bitnami PostgreSQL, Bitnami Redis, MinIO

## AI Resources

Confirmed live 2026-03-14. Fetch these for up-to-date API/usage docs in agent context.

| Dep         | llms.txt                                             | llms-full.txt                                                  | Other                                                                               |
| ----------- | ---------------------------------------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Next.js     | [llms.txt](https://nextjs.org/llms.txt)              | [llms-full.txt](https://nextjs.org/docs/llms-full.txt)         | MCP: `/_next/mcp` (dev)                                                             |
| Astro       | [llms.txt](https://docs.astro.build/llms.txt)        | [llms-full.txt](https://docs.astro.build/llms-full.txt)        | MCP: `mcp.docs.astro.build/mcp`                                                     |
| React       | [llms.txt](https://react.dev/llms.txt)               | —                                                              | —                                                                                   |
| Hono        | [llms.txt](https://hono.dev/llms.txt)                | [llms-full.txt](https://hono.dev/llms-full.txt)                | —                                                                                   |
| TanStack    | [llms.txt](https://tanstack.com/llms.txt)            | —                                                              | —                                                                                   |
| Better Auth | [llms.txt](https://better-auth.com/llms.txt)         | —                                                              | MCP: `mcp.inkeep.com/better-auth/mcp` · skills: `npx skills add better-auth/skills` |
| Drizzle     | [llms.txt](https://orm.drizzle.team/llms.txt)        | [llms-full.txt](https://orm.drizzle.team/llms-full.txt)        | —                                                                                   |
| Zod         | [llms.txt](https://zod.dev/llms.txt)                 | [llms-full.txt](https://zod.dev/llms-full.txt)                 | MCP: `mcp.inkeep.com/zod/mcp`                                                       |
| Vitest      | [llms.txt](https://vitest.dev/llms.txt)              | [llms-full.txt](https://vitest.dev/llms-full.txt)              | —                                                                                   |
| Bun         | [llms.txt](https://bun.sh/llms.txt)                  | [llms-full.txt](https://bun.sh/llms-full.txt)                  | —                                                                                   |
| Fumadocs    | [llms.txt](https://fumadocs.dev/llms.txt)            | [llms-full.txt](https://fumadocs.dev/llms-full.txt)            | —                                                                                   |
| MCP SDK     | [llms.txt](https://modelcontextprotocol.io/llms.txt) | [llms-full.txt](https://modelcontextprotocol.io/llms-full.txt) | —                                                                                   |
| shadcn/ui   | [llms.txt](https://ui.shadcn.com/llms.txt)           | —                                                              | —                                                                                   |
| Ruff        | [llms.txt](https://docs.astral.sh/ruff/llms.txt)     | —                                                              | —                                                                                   |
| PostHog     | [llms.txt](https://posthog.com/llms.txt)             | —                                                              | —                                                                                   |
| Supabase    | [llms.txt](https://supabase.com/llms.txt)            | —                                                              | Per-language: `supabase.com/llms/js.txt`                                            |

No AI surface confirmed: Tailwind CSS, Radix UI, Lucide, Biome, Playwright, Pino, FastAPI, Pydantic, Motion, Commander, Chalk, PostgreSQL, Redis, MinIO
