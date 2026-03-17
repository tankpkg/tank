# Resolution: Homepage UX for First-Time Visitors

**Issue:** #61 — Improve homepage UX and explanation for first-time visitors
**Date:** 2026-03-14
**Branch:** fix/61-homepage-ux
**File changed:** `packages/web/app/page.tsx`

## Finding

The homepage assumed visitors already understood what "agent skills" are, what Tank does, and why security matters. The hero headline ("Security-first package manager for AI agent skills") used insider terminology without defining it. The problem statement (ClawHavoc incident) was buried below the fold, after the feature grid.

A first-time visitor could not answer "what is Tank, who is it for, why does it exist" within the first screen.

## Root Cause

Section ordering prioritized technical features over visitor comprehension:

1. Hero with jargon-heavy headline
2. Stats
3. Code example (tank.json)
4. Feature grid
5. Problem statement (ClawHavoc) — too far down

No plain-language definition of "agent skills" existed anywhere above the fold.

## Fix

Restructured the page to follow the visitor's mental model:

1. **Hero** — Audience badge now explicitly names the target ("For developers using Claude Code, Cursor..."). Headline changed from "Security-first package manager for AI agent skills" to "The safe way to install AI agent skills". Subheadline now defines "agent skills" in plain language before using the term.

2. **Problem statement** — Moved immediately below the hero (second section). ClawHavoc callout is now prominent and visible without scrolling on most desktop viewports. Added a three-column risk summary (no versioning / no permissions / no scanning) to make the gap concrete.

3. **"What is Tank?" explainer** — New section added before the feature grid. Uses the npm analogy ("Tank is npm for agent skills") and a three-step how-it-works flow (publish with scanning → install with integrity → run with permission limits). Beginner-friendly, no assumed knowledge.

4. **Feature grid** — Unchanged, now appears after the visitor has context.

5. **FAQ** — Added "What are agent skills?" as the second question to serve visitors who scroll to FAQ for orientation.

## Acceptance Criteria Verified

- [x] A first-time visitor can understand what Tank is within the hero section
- [x] The homepage states who Tank is for in plain language (audience badge)
- [x] The security problem and Tank's differentiation are visible above the fold or immediately below it
- [x] The page has a clearer beginner-friendly flow: explanation → problem → how it works → features → action
- [x] Build passes (`bun run --filter '@internal/web' build` exits 0)
- [x] No new TypeScript errors introduced

## Gherkin Scenarios

See `.bdd/features/web-registry/homepage-ux.feature` — all scenarios now satisfied by the implementation.
