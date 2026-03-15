# Resolution 006 — Issue #71 token usage tracking and ranking

## Root cause

The publish pipeline persisted `file_count` and `tarball_size` but had no token usage metadata. The registry search/sort model and cards/detail views therefore could not rank or display package prompt-size cost.

## Changes made

1. **Schema + migration**
   - Added nullable `token_count` column to `skill_versions`.
   - Added index `skill_versions_token_count_idx`.
   - Files:
     - `packages/web/lib/db/schema.ts`
     - `packages/web/drizzle/0012_token_count.sql`
     - `packages/web/drizzle/meta/_journal.json`

2. **Publish-time token calculation (server-side confirm route)**
   - Added tarball download + gzip unpack + tar extraction in confirm route.
   - Concatenated decoded file text length and computed `ceil(chars / 4)`.
   - Persisted `tokenCount` in `skill_versions` when available.
   - Failure path is non-blocking and returns publish success.
   - File: `packages/web/app/api/v1/skills/confirm/route.ts`

3. **Registry data model + sorting**
   - Extended search/detail types to include `tokenCount`.
   - Added `tokens` sort option and SQL ordering (`NULLS last` behavior via boolean + coalesce ordering).
   - Added token count projection in search and skill detail queries.
   - File: `packages/web/lib/data/skills.ts`

4. **API + UI exposure**
   - `/api/v1/search` now accepts and forwards `sort=tokens`.
   - `/api/v1/skills/[name]` now returns `tokenCount` for latest version.
   - Skill cards display token badge (`~2.4k tokens`).
   - Skill detail metadata sidebar shows token count.
   - Files:
     - `packages/web/app/api/v1/search/route.ts`
     - `packages/web/app/api/v1/skills/[name]/route.ts`
     - `packages/web/app/(registry)/skills/page.tsx`
     - `packages/web/app/(registry)/skills/skills-sort.tsx`
     - `packages/web/app/(registry)/skills/skills-results.tsx`
     - `packages/web/app/(registry)/skills/[...name]/page.tsx`

5. **IDD/BDD updates**
   - Added token constraints/examples to publish + web-registry intents.
   - Added Gherkin scenarios for token persistence and token sorting.
   - Added/updated tests for publish confirm token behavior and search/name routes.

## Verification summary

- `bun run test app/api/v1/skills/__tests__/publish.test.ts app/api/v1/search/__tests__/search.test.ts "app/api/v1/skills/[name]/__tests__/registry-read.test.ts" lib/db/__tests__/schema.test.ts` (in `packages/web`) ✅
- `bun run build --filter=@internal/shared --filter=@internal/web` ✅
- LSP diagnostics on changed TS/TSX files ✅ clean
