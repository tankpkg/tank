# Where to Look

Task-to-location map for the current repo layout.

Lookup:

- `add CLI command → packages/cli/src/commands/ → register in packages/cli/src/bin/tank.ts`
- `add MCP tool → packages/mcp-server/src/tools/ → register in packages/mcp-server/src/index.ts`
- `modify CLI install/publish internals → packages/cli/src/lib/ → packer, lockfile, resolver, config`
- `add public API route → apps/web/app/api/v1/ → App Router route handlers`
- `add admin API route → apps/web/app/api/admin/ → admin-only handlers`
- `change auth behavior → apps/web/lib/auth.ts → session, API key, org, OIDC`
- `change API key validation → apps/web/lib/auth-helpers.ts → CLI/session auth helpers`
- `change domain DB schema → apps/web/lib/db/schema.ts → Drizzle schema`
- `inspect generated auth schema → apps/web/lib/db/auth-schema.ts → generated; never edit by hand`
- `change storage backend logic → apps/web/lib/storage/provider.ts → Supabase vs S3`
- `change browse/search data access → apps/web/lib/data/skills.ts → read-path query layer`
- `add shared schema/type/constant → packages/internals-schemas/src/ → export via packages/internals-schemas/src/index.ts`
- `add shared helper → packages/internals-helpers/src/ → export via packages/internals-helpers/src/index.ts`
- `change permission schema → packages/internals-schemas/src/schemas/permissions.ts → shared Zod contract`
- `change lockfile schema → packages/internals-schemas/src/schemas/skills-lock.ts → v1/v2 support`
- `change scanner stages → apps/python-api/lib/scan/ → stage0-stage5, verdict, models`
- `change scanner HTTP surface → apps/python-api/api/ → FastAPI routes`
- `change E2E helpers → e2e/helpers/ → real CLI and fixture setup`
- `change root BDD steps → .bdd/steps/ → MCP/admin/search scenarios`
- `change browser BDD → e2e/bdd/ → Playwright BDD`
- `generated web docs → apps/web/content/docs/ → source for site docs and llms export`
- `docs generators → scripts/ → CLI, API, llms generation`
