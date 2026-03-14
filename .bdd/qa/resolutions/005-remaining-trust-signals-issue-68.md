# Resolution 005: Remaining lightweight trust signals (GH-68)

**Finding:** Trust badge system shipped in #174, but remaining trust signals were still missing from browse/detail UX.
**Issue:** [tankpkg/tank#68](https://github.com/tankpkg/tank/issues/68)
**Date:** 2026-03-14
**Files changed:**

- `.idd/modules/trust-badge/INTENT.md`
- `.idd/modules/badge/INTENT.md`
- `.bdd/features/trust-badge/trust-badge.feature`
- `.bdd/steps/trust-badge.steps.ts`
- `packages/web/lib/__tests__/trust-signals.test.ts`
- `packages/web/lib/trust-signals.ts`
- `packages/web/lib/data/skills.ts`
- `packages/web/components/security/VerifiedPublisherBadge.tsx`
- `packages/web/components/security/index.ts`
- `packages/web/app/(registry)/skills/page.tsx`
- `packages/web/app/(registry)/skills/[...name]/page.tsx`
- `packages/web/app/(registry)/skills/skills-results.tsx`

## Root Cause

PR #174 replaced score-first badges with trust-level badges, but did not finish lightweight trust metadata presentation:

1. No explicit verified publisher indicator in browse/detail views.
2. Last scan freshness signal not surfaced on skill cards.
3. Install count labeling remained download-centric and not consistently presented as trust signal metadata.

## RED → GREEN

### RED

- Added trust-signal helper tests in `packages/web/lib/__tests__/trust-signals.test.ts`.
- Initial run failed because `@/lib/trust-signals` did not exist.

### GREEN

1. Added `packages/web/lib/trust-signals.ts`:
   - `formatInstallCount`
   - `isPublisherVerified`
   - `formatLastScanLabel`
2. Extended skill data projection in `packages/web/lib/data/skills.ts`:
   - Added `publisherVerified` and `scannedAt` for search/list payloads.
   - Added publisher `emailVerified` to detail payload.
   - Switched displayed install counts to all-time aggregate (`SUM(count)`).
3. Added `VerifiedPublisherBadge` UI component.
4. Surfaced trust signals in browse/detail pages:
   - Browse cards: verified publisher badge, install count label, last scan label.
   - Detail metadata: installs row, last scan row, verified publisher badge.
5. Updated IDD + BDD artifacts to capture issue #68 requirements.

## Verification

- RED evidence:
  - `bun run test -- --reporter=dot lib/__tests__/trust-signals.test.ts` failed (module missing).
- GREEN evidence:
  - `bun run test -- --reporter=dot lib/__tests__/trust-signals.test.ts` passed (3/3).
- BDD execution status:
  - `bunx vitest run --config .bdd/vitest.config.ts .bdd/steps/trust-badge.steps.ts` skipped (requires `DATABASE_URL` + `E2E_REGISTRY_URL`).
- Build:
  - `bun run build` passed (monorepo build successful).
