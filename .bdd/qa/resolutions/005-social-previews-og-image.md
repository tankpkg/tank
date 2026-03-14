# Resolution: Social Previews (Open Graph) — Issue #107

**Date:** 2026-03-14
**Issue:** #107 — Social previews incomplete and inconsistent
**Branch:** fix/107-social-previews
**Status:** RESOLVED

## Root Cause

`packages/web/app/layout.tsx` referenced `/og-image.png` in both `openGraph.images` and `twitter.images`. This file does not exist in `public/`, causing every page's social preview to show a broken/missing image on Twitter/X, LinkedIn, Slack, and iMessage.

The docs route (`/docs`) had a working OG image via `app/docs/opengraph-image.tsx`, but no equivalent existed at the app root.

## Bug Scenario (RED)

```gherkin
Scenario: Homepage OG image resolves to a real URL
  When I request the homepage HTML at "/"
  Then the og:image URL does not contain "og-image.png"
  And the og:image URL resolves with HTTP 200
```

Before fix: `og:image` = `/og-image.png` → 404.

## Fix Applied (GREEN)

### 1. Created `packages/web/app/opengraph-image.tsx`

Next.js App Router convention: a file named `opengraph-image.tsx` at any route segment is automatically served at `/opengraph-image` and linked as the OG image for that segment. Created a 1200×630 edge-rendered PNG with Tank branding (dark background, shield icon, headline, feature pills).

### 2. Updated `packages/web/app/layout.tsx`

Replaced both `/og-image.png` references with `/opengraph-image`:

- `openGraph.images[0].url`: `/og-image.png` → `/opengraph-image`
- `twitter.images[0]`: `/og-image.png` → `/opengraph-image`

Also removed unused `Viewport` import (Biome warning).

### 3. Added OG metadata to skills listing page

`packages/web/app/(registry)/skills/page.tsx` was missing `openGraph.images` and `twitter` metadata. Added both pointing to `/opengraph-image`.

### 4. Skill detail pages (already correct)

`packages/web/app/(registry)/skills/[...name]/page.tsx` already had correct `generateMetadata` with `og:image` pointing to `/api/og/[name]` (dynamic per-skill OG image). No changes needed.

## Verification

- `bun turbo build --filter=@internal/web` passes with 0 errors
- `/opengraph-image` appears as a registered dynamic route (`ƒ`) in the build output
- `/docs/opengraph-image` continues to work (unchanged)
- Biome lint passes on all changed files

## Files Changed

| File                                          | Change                                                              |
| --------------------------------------------- | ------------------------------------------------------------------- |
| `packages/web/app/opengraph-image.tsx`        | **NEW** — homepage OG image generator (edge, 1200×630)              |
| `packages/web/app/layout.tsx`                 | Fixed `/og-image.png` → `/opengraph-image` in OG + Twitter metadata |
| `packages/web/app/(registry)/skills/page.tsx` | Added `openGraph.images` and `twitter` metadata                     |

## IDD Artifacts

- `.idd/modules/web-seo/INTENT.md` — new module documenting OG constraints
- `.bdd/features/web-seo/social-previews.feature` — Gherkin scenarios for social previews
