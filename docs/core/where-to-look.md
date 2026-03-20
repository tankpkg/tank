# Where to Look

Task-to-location map for the current repo layout.

## Product And Web

- `TanStack public route / loader / head → apps/registry/src/routes/`
- `TanStack API route → apps/registry/src/api/routes/`
- `TanStack auth/session/data helpers → apps/registry/src/lib/`
- `TanStack screen/layout/component → apps/registry/src/screens/ + src/components/`
- `TanStack server functions / data loaders → apps/registry/src/query/`
- `TanStack auth helpers → apps/registry/src/lib/auth/`
- `Shared docs source for docs pages → apps/registry/content/docs/`

## CLI / MCP / Shared

- `add CLI command → packages/cli/src/commands/ → register in packages/cli/src/bin/tank.ts`
- `modify CLI install/publish internals → packages/cli/src/lib/`
- `add MCP tool → packages/mcp-server/src/tools/ → register in packages/mcp-server/src/index.ts`
- `add shared schema/type/constant → packages/internals-schemas/src/`
- `add shared helper → packages/internals-helpers/src/`

## Scanner / Data / Infra

- `scanner stages → apps/python-api/lib/scan/`
- `scanner HTTP surface → apps/python-api/api/`
- `storage backend logic → apps/registry/src/services/storage/`
- `DB schema → apps/registry/src/lib/db/`

## Agent Infra

- `capability intent → idd/modules/<capability>/INTENT.md`
- `active initiative / migration plan → idd/active/`
- `system BDD feature or step → bdd/features/system/ + bdd/steps/system/`
- `browser BDD shared / next / tanstack → bdd/features/browser/ + bdd/steps/browser/`
- `E2E helpers / targets → e2e/helpers/ + e2e/targets.ts`
- `CLI / API / admin / onprem E2E → e2e/cli/ + e2e/api/ + e2e/admin/ + e2e/onprem/`
- `docs generators → scripts/`
