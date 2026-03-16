# Where to Look

Task-to-location map for the current repo layout.

Lookup:

- `add CLI command → packages/cli/src/commands/ → register in packages/cli/src/bin/tank.ts`
- `add MCP tool → packages/mcp-server/src/tools/ → register in packages/mcp-server/src/index.ts`
- `modify CLI install/publish internals → packages/cli/src/lib/ → packer, lockfile, resolver, config`
- `add public API route → packages/web/app/api/v1/ → App Router route handlers`
- `add admin API route → packages/web/app/api/admin/ → admin-only handlers`
- `change auth behavior → packages/web/lib/auth.ts → session, API key, org, OIDC`
- `change API key validation → packages/web/lib/auth-helpers.ts → CLI/session auth helpers`
- `change domain DB schema → packages/web/lib/db/schema.ts → Drizzle schema`
- `inspect generated auth schema → packages/web/lib/db/auth-schema.ts → generated; never edit by hand`
- `change storage backend logic → packages/web/lib/storage/provider.ts → Supabase vs S3`
- `change browse/search data access → packages/web/lib/data/skills.ts → read-path query layer`
- `add shared schema/type/constant → packages/shared/src/ → export via packages/shared/src/index.ts`
- `change permission schema → packages/shared/src/schemas/permissions.ts → shared Zod contract`
- `change lockfile schema → packages/shared/src/schemas/skills-lock.ts → v1/v2 support`
- `change scanner stages → packages/scanner/lib/scan/ → stage0-stage5, verdict, models`
- `change scanner HTTP surface → packages/scanner/api/ → FastAPI routes`
- `change E2E helpers → e2e/helpers/ → real CLI and fixture setup`
- `change root BDD steps → .bdd/steps/ → MCP/admin/search scenarios`
- `change browser BDD → e2e/bdd/ → Playwright BDD`
- `generated web docs → packages/web/content/docs/ → source for site docs and llms export`
- `docs generators → scripts/ → CLI, API, llms generation`
