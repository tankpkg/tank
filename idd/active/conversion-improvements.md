# Conversion Improvements Initiative

**Issue:** https://github.com/tankpkg/tank/issues/462
**Branch:** feat/conversion-improvements
**Status:** INTENT written, awaiting RED

---

## Summary

Analytics (May 2026, 30 days) reveal conversion gaps:

- **73%** of homepage visitors never reach docs
- **41%** of all traffic goes directly to `/skills` — browse-and-leave pattern
- Vault, Atoms, Security Pipeline (Tank's differentiators) get **1-2 views each**
- MCP docs get early traction — highest-intent audience

This initiative addresses 14 specific changes across 4 modules.

---

## Modules

| Module                     | IDD                                                        | Items                                                             | Test type            |
| -------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------- | -------------------- |
| `conversion-homepage`      | [INTENT.md](../modules/conversion-homepage/INTENT.md)      | 5: section reorder, hero pills, hero CTAs, hero stats, sticky nav | HTML fetch E2E       |
| `conversion-skills-list`   | [INTENT.md](../modules/conversion-skills-list/INTENT.md)   | 3: value banner, getting-started sidebar, card install snippets   | Browser E2E          |
| `conversion-skill-detail`  | [INTENT.md](../modules/conversion-skill-detail/INTENT.md)  | 2: desktop install command, default security tab                  | Browser E2E          |
| `conversion-cross-cutting` | [INTENT.md](../modules/conversion-cross-cutting/INTENT.md) | 4: docs CTA, command palette, section IDs, CLI telemetry          | HTML fetch + CLI E2E |

---

## Implementation Order

```
Phase 1: INTENT  (4 IDD files)                                              [DONE]
Phase 2: RED     (4 Gherkin files + 1 steps file + 1 CLI test)             [NEXT]
Phase 3: GREEN   (homepage → skills list → skill detail → cross-cutting)
Phase 4: REFACTOR (shared InstallSnippet component, verify all tests green)
```

---

## Phase 2: RED — Test Files to Create

| File                                                                   | Covers                                                                                  | Module                                 |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | -------------------------------------- |
| `bdd/features/system/web-registry/conversion-homepage.feature`         | Hero HTML assertions (data-testids), section order (via HTML structure)                 | conversion-homepage                    |
| `bdd/features/browser/tanstack/skills/conversion-skills.feature`       | Value banner visibility/dismiss, getting-started card, skill card install snippets      | conversion-skills-list                 |
| `bdd/features/browser/tanstack/skill-detail/conversion-detail.feature` | Desktop install command visible, default tab=security when scan data exists, trust card | conversion-skill-detail                |
| `bdd/features/system/web-registry/conversion-cross-cutting.feature`    | Docs HTML has CTA, command palette source has suggestions, section IDs present          | conversion-cross-cutting (items 11-13) |
| `e2e/cli/telemetry.e2e.test.ts`                                        | Telemetry opt-in/out, config write, env override, event validation                      | conversion-cross-cutting (item 14)     |
| `e2e/bdd/steps/conversion.steps.ts`                                    | Shared step definitions for all conversion Gherkin scenarios                            | all                                    |

---

## Phase 3: GREEN — Code Changes per File

### Homepage

| File                                                       | Lines  | Change                                                                                                  |
| ---------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------- |
| `apps/registry/src/screens/home-screen.tsx`                | 78-106 | Reorder: WhyTankExists → Vault → HowItWorks → Atoms before ComparisonTable; add StickySectionNav import |
| `apps/registry/src/components/home/hero-section.tsx`       | 56-105 | Add 4-pill row, Button CTAs, stats row                                                                  |
| `apps/registry/src/components/home/vault-section.tsx`      | 40     | Add `id="vault"` on section                                                                             |
| `apps/registry/src/components/home/atoms-section.tsx`      | 1      | Add `id="atoms"` on section                                                                             |
| `apps/registry/src/components/home/how-it-works.tsx`       | 40     | Add `id="how-it-works"` on section                                                                      |
| `apps/registry/src/components/home/why-tank-exists.tsx`    | 40     | Add `id="why-tank"` on section                                                                          |
| `apps/registry/src/components/home/features-grid.tsx`      | 1      | Add `id="features"` on section                                                                          |
| `apps/registry/src/components/home/faq-section.tsx`        | 1      | Add `id="faq"` on section                                                                               |
| `apps/registry/src/components/home/sticky-section-nav.tsx` | NEW    | Sticky section nav component with IntersectionObserver                                                  |

### Skills List

| File                                                      | Lines  | Change                                                          |
| --------------------------------------------------------- | ------ | --------------------------------------------------------------- |
| `apps/registry/src/screens/skills-list-screen.tsx`        | 59-112 | Add ValueBanner import, GettingStarted import, modify SkillCard |
| `apps/registry/src/components/skills/value-banner.tsx`    | NEW    | Dismissible banner with localStorage                            |
| `apps/registry/src/components/skills/getting-started.tsx` | NEW    | 3-step flow card in sidebar                                     |
| `apps/registry/src/components/skills/install-snippet.tsx` | NEW    | Reusable `tank install <name>` with copy                        |

### Skill Detail

| File                                                | Lines  | Change                                                                                             |
| --------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------- |
| `apps/registry/src/screens/skill-detail-screen.tsx` | 61-259 | Remove `lg:hidden` from install area; add desktop install in header; default tab logic; trust card |

### Cross-Cutting

| File                                               | Lines | Change                                                               |
| -------------------------------------------------- | ----- | -------------------------------------------------------------------- | --- | ------------------ |
| `apps/registry/src/routes/docs/$.tsx`              | 99    | Add `<DocsBottomCta />` after `</article>`                           |
| `apps/registry/src/components/docs-bottom-cta.tsx` | NEW   | Install command + Browse Packages link                               |
| `apps/registry/src/components/command-menu.tsx`    | TBD   | Add "What is Tank?" and "How does scanning work?" suggestions        |
| `packages/cli/src/telemetry.ts`                    | NEW   | Telemetry module: opt-in, posthog-node, event capture, env override  |
| `packages/cli/src/commands/telemetry.ts`           | NEW   | `tank telemetry on                                                   | off | status` subcommand |
| `packages/cli/src/bin/tank.ts`                     | TBD   | Wire telemetry init, add `telemetry` subcommand, prompt on first run |
| `packages/cli/package.json`                        | TBD   | Add `posthog-node` dependency                                        |

---

## Phase 4: REFACTOR

- Extract repeated install snippet rendering into `InstallSnippet` component (used in: SkillCard, SkillDetail header, SkillDetail mobile, GettingStarted sidebar, DocsBottomCta)
- Verify all existing tests pass (homepage UX, homepage-seo, search, skill-detail, skill-detail-mobile)
- Run full BDD suite: `just test bdd`
- Run E2E suite: `just test e2e`

---

## Risks

| Risk                                                     | Mitigation                                                                       |
| -------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Section reorder breaks mobile layout                     | Existing sections use `py-20` with `max-w-[1000px]` — independent stacking       |
| Sticky nav intersects with existing nav (`sticky top-0`) | Use `top-14` (header height) for sticky nav                                      |
| CLI telemetry adds PostHog dependency to binary          | `posthog-node` is ~50KB bundled; fire-and-forget with subprocess or queue        |
| Install snippet click triggers card navigation           | Use `e.stopPropagation()` + `e.preventDefault()` in copy handler                 |
| Default tab change could confuse returning users         | Only change default when `hasSecurityData === true` AND no tab preference in URL |

---

## Open Questions

1. **CLI telemetry PostHog key:** compile-time injected vs runtime env var? Compile-time = all binaries from GitHub Releases share the key. Runtime = self-hosted can bring own. Which?
2. **Sticky nav mobile position:** below header bar (`top-14`) or replace header? Below header matches Stripe Docs / Linear pattern.
3. **Getting-started card for logged-in users:** show "You're authenticated" instead of step 1, or hide entirely?
4. **Docs bottom CTA wording:** "Ready to try? [copyable command] [Browse packages →]" or something else?
