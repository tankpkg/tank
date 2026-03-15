# Finding 006 — Issue #71 Token usage tracking and ranking

## Scope

- Issue: #71
- Module intents: `.idd/modules/publish/INTENT.md`, `.idd/modules/web-registry/INTENT.md`
- Behavioral targets:
  - publish confirm calculates and persists token count
  - publish confirm does not fail when token counting fails
  - registry search supports `sort=tokens`
  - registry metadata/search responses include token count

## RED evidence

- Before implementation, no `token_count` column existed in `skill_versions`.
- Search sort options did not include `tokens` (`SortOption` omitted `tokens`, UI omitted option).
- Confirm route did not calculate token usage from tarball content.
- Registry card/detail views did not render token usage.

## GREEN verification

- Targeted tests pass:
  - `packages/web/app/api/v1/skills/__tests__/publish.test.ts`
  - `packages/web/app/api/v1/search/__tests__/search.test.ts`
  - `packages/web/app/api/v1/skills/[name]/__tests__/registry-read.test.ts`
  - `packages/web/lib/db/__tests__/schema.test.ts`
- Build passes:
  - `bun run build --filter=@internal/shared --filter=@internal/web`
- LSP diagnostics: clean for all changed TypeScript/TSX files.

## Notes

- Token method is heuristic by design (MVP): `ceil(totalCharacters / 4)`.
- Counting is best-effort; any extraction/decode failure keeps publish success path intact.
