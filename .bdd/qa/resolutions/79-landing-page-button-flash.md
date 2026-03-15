# Resolution: Landing page CTA button flash after hydration

**Issue**: https://github.com/tankpkg/tank/issues/79
**Date**: 2026-03-14
**Branch**: fix/79-landing-page-buttons
**Status**: RESOLVED

## Symptom

Landing page CTA buttons ("Get Started" in navbar and hero) were replaced with
"Open Dashboard" after React hydration for logged-in users. This caused a visible
flash/replacement on every page load.

## Root Cause

`home-auth-cta.tsx` used `useSession()` from `better-auth/react` without checking
the loading state:

```ts
const { data: session } = useSession();
const isLoggedIn = Boolean(session?.user?.id);
```

`useSession()` initialises with `data: undefined` (loading). So on first render:

- `isLoggedIn = Boolean(undefined?.user?.id)` → `false`
- Renders "Get Started" (matches SSR — no hydration error)

After hydration, `useSession` resolves the real session. If the user is logged in:

- `isLoggedIn` becomes `true`
- Re-renders to "Open Dashboard"
- Visible flash for authenticated users

## Fix

Added `isPending` guard so `isLoggedIn` stays `false` while the session is loading:

```ts
const { data: session, isPending } = useSession();
const isLoggedIn = !isPending && Boolean(session?.user?.id);
```

This ensures:

1. During loading → `isLoggedIn = false` → "Get Started" (matches SSR)
2. After load, not authenticated → `isLoggedIn = false` → "Get Started" (stable)
3. After load, authenticated → `isLoggedIn = true` → "Open Dashboard" (single update, no flash)

Applied to both `HomeNavAuthCta` and `HomePrimaryAuthCta` in `home-auth-cta.tsx`.

## Files Changed

- `packages/web/app/home-auth-cta.tsx` — added `isPending` guard to both components

## Verification

- `bun run --filter '@internal/web' build` → exits 0
- LSP diagnostics on changed file → clean
- `isPending` field confirmed available from `better-auth/react` `useSession()` (already used in `cli-login/page.tsx`)

## IDD/BDD Artifacts

- `.idd/modules/home-landing/INTENT.md` — created (constraint C3 captures this fix)
- `.bdd/features/home-landing/cta-buttons.feature` — created (4 scenarios covering stable/flash/loading/hydration)
