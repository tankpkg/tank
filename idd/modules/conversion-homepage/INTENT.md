# Conversion: Homepage

## Anchor

**Why this module exists:** Analytics (May 2026, 30 days) show 73% of homepage visitors never reach docs, and Tank's most differentiating features (Vault, Atoms, security pipeline) sit buried at sections 8-10 of 15. The homepage must surface differentiators earlier, make CTAs scannable, and help users navigate a long page.

**Consumers:** First-time visitors, returning users browsing packages.

**Single source of truth:** `apps/registry/src/screens/home-screen.tsx`.

---

## Layer 1: Structure

```
apps/registry/src/screens/home-screen.tsx              # Section ordering
apps/registry/src/components/home/hero-section.tsx     # Hero CTAs, pills, stats
apps/registry/src/components/home/vault-section.tsx    # Needs id="vault"
apps/registry/src/components/home/atoms-section.tsx    # Needs id="atoms"
apps/registry/src/components/home/how-it-works.tsx     # Needs id="how-it-works"
apps/registry/src/components/home/sticky-section-nav.tsx  # NEW
```

---

## Layer 2: Constraints

| #   | Rule                                                                              | Rationale                                                                 |
| --- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| C1  | Sections must be ordered: Hero → WorksWith → WhyTankExists → Vault → HowItWorks → Atoms → ComparisonTable → FeaturesGrid → rest | Vault and Atoms (differentiators) must appear in first 5 sections |
| C2  | ComparisonTable must appear after differentiators, not before                    | Competitive info serves skeptics, not first-time discoverers             |
| C3  | Hero must display 4 scannable differentiator pills below subtitle                 | Scanners understand Tank in <1 second without reading paragraph text     |
| C4  | Differentiator pills must scroll to their section via href fragments              | Pills must be actionable, not decorative                                 |
| C5  | Hero must have visible Button CTAs for "Browse Packages" and "View Docs"          | Current text links at 13px muted color are invisible                      |
| C6  | Hero must show social proof stats: `{N} packages · {N} GitHub stars · MIT`        | Reduces bounce for skeptical visitors                                      |
| C7  | Sticky section nav must appear after scrolling past hero on desktop              | Long pages lose users without navigation                                  |
| C8  | Sticky nav must scroll horizontally on mobile                                    | Must not break mobile layout                                              |
| C9  | Sticky nav must highlight the currently visible section                           | Users must know where they are on the page                               |
| C10 | WhyTankExists must not assume visitors know "skills", "lockfiles", or "semver"    | Existing constraint H6 from homepage UX — must not regress                |
| C11 | All section components receiving pill anchors must have id attributes             | `#vault`, `#atoms`, `#how-it-works`, `#why-tank`, `#features`, `#faq`   |

---

## Layer 3: Examples

| #    | Visitor type / action                                       | Expected behavior                                                              |
| ---- | ----------------------------------------------------------- | ------------------------------------------------------------------------------ |
| E1   | First-time visitor loads homepage                          | Sees hero headline, then 4 pills (Scanning, Vault, Permissions, Integrity), then install CTA with "Browse Packages" button |
| E2   | Visitor clicks "Credential Vault" pill                     | Page scrolls to `#vault` section                                              |
| E3   | Visitor scrolls past hero                                  | Sticky section nav appears at top of viewport with section links              |
| E4   | Visitor sees hero subtitle                                 | Can scan 4 pills and understand key differentiators in <5 seconds            |
| E5   | Visitor wants to browse without reading                   | Has visible "Browse Packages" button at full text size, not hidden tiny link |
| E6   | Visitor at section 12 (Enterprise) wants to jump to FAQ    | Uses sticky nav to jump to FAQ without scrolling back                        |
| E7   | Visitor on mobile scrolls past hero                        | Sticky nav appears, scrolls horizontally, highlights active section           |
| E8   | Homepage HTML fetched (SEO test)                           | Hero contains `data-testid="hero-differentiator-pills"` with 4 children      |
| E9   | Homepage HTML fetched (SEO test)                           | Hero contains `data-testid="home-primary-cta"` (Browse Packages) and `data-testid="home-secondary-cta"` (View Docs) |
| E10  | Homepage HTML fetched (SEO test)                           | Hero contains `data-testid="hero-stats"` with package count, star count, and license text |
