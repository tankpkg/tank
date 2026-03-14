# Web SEO & Social Previews Module

## Anchor

**Why this module exists:** Tank's web pages must produce correct Open Graph and Twitter Card metadata so that sharing a link on Slack, Twitter, LinkedIn, or iMessage renders a rich preview. Without working OG images, every shared link shows a blank card — undermining trust and discoverability.

**Consumers:** Social platforms (Twitter/X, LinkedIn, Slack, iMessage), search engines (Google, Bing), link-preview crawlers.

**Single source of truth:**

- `packages/web/app/opengraph-image.tsx` — homepage OG image (dynamic, edge)
- `packages/web/app/layout.tsx` — root metadata with OG/Twitter tags
- `packages/web/app/(registry)/skills/[...name]/page.tsx` — skill detail OG metadata
- `packages/web/app/api/og/[...name]/route.tsx` — skill OG image API route

---

## Layer 1: Structure

```
packages/web/app/
  opengraph-image.tsx              # Homepage OG image (Next.js convention, edge)
  layout.tsx                       # Root metadata — og:image points to /opengraph-image
  docs/
    opengraph-image.tsx            # Docs OG image (already exists)
  (registry)/skills/[...name]/
    page.tsx                       # generateMetadata → og:image → /api/og/[name]
  api/og/[...name]/
    route.tsx                      # Dynamic skill OG image (already exists)
```

---

## Layer 2: Constraints

| #   | Rule                                                                                  | Rationale                                                  | Verified by  |
| --- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ------------ |
| C1  | Homepage `og:image` must resolve to a real, non-404 URL                               | Broken image = blank social card                           | BDD scenario |
| C2  | Homepage OG image must be 1200×630 px                                                 | Standard social preview dimensions                         | BDD scenario |
| C3  | `layout.tsx` metadata must NOT reference `/og-image.png` (file does not exist)        | Prevents 404 on every page's social preview                | Code review  |
| C4  | Skill detail pages must include `og:image` pointing to `/api/og/[name]`               | Each skill gets a unique, data-rich preview card           | BDD scenario |
| C5  | All OG images must use `runtime = 'edge'` or equivalent for fast cold starts          | Social crawlers have short timeouts                        | Code review  |
| C6  | `og:title`, `og:description`, `og:url`, `og:type` must be present on all public pages | Minimum viable social preview                              | BDD scenario |
| C7  | Twitter card type must be `summary_large_image` on all public pages                   | Renders the large image format on Twitter/X                | BDD scenario |
| C8  | OG image generators must never throw — fall back to defaults on data errors           | Crawlers must always get an image, even for unknown skills | Code review  |

---

## Layer 3: Examples

| #   | Input                                | Expected Output                                                                  |
| --- | ------------------------------------ | -------------------------------------------------------------------------------- |
| E1  | `GET /opengraph-image` (homepage OG) | 200 PNG, 1200×630, contains "Tank" branding                                      |
| E2  | `GET /` HTML                         | `<meta property="og:image">` resolves to a real URL (not `/og-image.png`)        |
| E3  | `GET /skills/@org/skill` HTML        | `<meta property="og:image">` = `/api/og/%40org%2Fskill`, `og:title` = skill name |
| E4  | `GET /api/og/@org/nonexistent`       | 200 PNG with fallback "AI agent skill on Tank" text (no 500)                     |
| E5  | `GET /` HTML                         | `<meta name="twitter:card" content="summary_large_image">`                       |
| E6  | `GET /docs` HTML                     | `<meta property="og:image">` resolves to docs OG image (already working)         |
