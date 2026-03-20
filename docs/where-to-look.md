# Where to Look

Task-to-location map for the current repo layout.

Lookup:

- `add CLI command → packages/cli/src/commands/ → register in packages/cli/src/bin/tank.ts`
- `add MCP tool → packages/mcp-server/src/tools/ → register in packages/mcp-server/src/index.ts`
- `modify CLI install/publish internals → packages/cli/src/lib/ → packer, lockfile, resolver, config`
- `add public API route → apps/registry/src/api/routes/`
- `change auth behavior → apps/registry/src/lib/auth/core.ts → session, API key, org, OIDC`
- `change API key validation → apps/registry/src/lib/auth/tokens.ts → CLI/session auth helpers`
- `change domain DB schema → apps/registry/src/lib/db/schema.ts → Drizzle schema`
- `inspect generated auth schema → apps/registry/src/lib/db/auth-schema.ts → generated; never edit by hand`
- `change storage backend logic → apps/registry/src/services/storage/ → Supabase vs S3`
- `change browse/search data access → apps/registry/src/lib/skills/`
- `add shared schema/type/constant → packages/internals-schemas/src/ → export via packages/internals-schemas/src/index.ts`
- `change permission schema → packages/internals-schemas/src/schemas/permissions.ts → shared Zod contract`
- `change lockfile schema → packages/internals-schemas/src/schemas/skills-lock.ts → v1/v2 support`
- `change scanner stages → apps/python-api/lib/scan/ → stage0-stage5, verdict, models`
- `change scanner HTTP surface → apps/python-api/api/ → FastAPI routes`
- `change E2E helpers → e2e/helpers/ → real CLI and fixture setup`
- `change root BDD steps → bdd/steps/ → MCP/admin/search scenarios`
- `change browser BDD → e2e/bdd/ → Playwright BDD`
- `generated web docs → apps/registry/content/docs/ → source for site docs and llms export`
- `docs generators → scripts/ → CLI, API, llms generation`
