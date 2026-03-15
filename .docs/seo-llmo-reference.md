# SEO & LLMO Reference

Research for Tank's search engine and LLM optimization. Covers standards, patterns, crawler landscape, and implementation guides.

## llms.txt Standard

**Spec:** [llmstxt.org](https://llmstxt.org) — created by Jeremy Howard (fast.ai), September 2024.
**Adoption:** 800+ sites tracked at [llmstxt.site](https://llmstxt.site).

### Format

```markdown
# Project Name ← required

> Brief description ← optional blockquote

Additional prose (no headings allowed) ← optional

## Section Name ← optional H2 sections

- [Link Title](url): Description notes ← file list items

## Optional ← special: can be skipped for shorter context

- [Changelog](url): Version history
```

### Companion Files

| File                | Purpose                                                  |
| ------------------- | -------------------------------------------------------- |
| `llms.txt`          | Curated index — links + descriptions (small token count) |
| `llms-full.txt`     | All documentation content concatenated (large)           |
| `llms-ctx.txt`      | Processed/expanded llms.txt in XML structure             |
| `llms-ctx-full.txt` | Expanded including optional URLs                         |

### Notable Implementations

- **Stripe** — [docs.stripe.com/llms.txt](https://docs.stripe.com/llms.txt) — 200+ pages. Includes "Instructions for Large Language Model Agents" section that directs LLMs which APIs to recommend and which are deprecated.
- **Vercel** — [vercel.com/llms.txt](https://vercel.com/llms.txt) — 12 major doc categories.
- **Next.js** — [nextjs.org/docs/llms.txt](https://nextjs.org/docs/llms.txt) + `llms-full.txt` — versioned per major version (14, 15, 16), includes `@doc-version` metadata. Each page in llms-full.txt has YAML frontmatter (title, description, url, version).
- **TanStack** — [tanstack.com/llms.txt](https://tanstack.com/llms.txt) — 18+ libraries by category, 20+ ecosystem tools.
- **Supabase** — [supabase.com/llms.txt](https://supabase.com/llms.txt) — guides, language SDKs, CLI reference.

### Stripe's Innovation: LLM Agent Instructions

Stripe embeds explicit guidance for LLMs in their llms.txt:

- API preference guidance (use X, not deprecated Y)
- Common mistake prevention (don't use Sources API, use Payment Intents)
- Recommended patterns (Setup Intent API for saving payment methods)

This directly shapes how AI assistants recommend your product.

---

## AI Crawler Landscape

Source: [knownagents.com/agents](https://knownagents.com/agents)

### Training Crawlers (scrape for model training)

| Bot               | Operator     | User Agent          |
| ----------------- | ------------ | ------------------- |
| ClaudeBot         | Anthropic    | `ClaudeBot`         |
| GPTBot            | OpenAI       | `GPTBot`            |
| Google-Extended   | Google       | `Google-Extended`   |
| Applebot-Extended | Apple        | `Applebot-Extended` |
| Bytespider        | ByteDance    | `Bytespider`        |
| CCBot             | Common Crawl | `CCBot`             |

### Search Crawlers (index for AI-powered search)

| Bot              | Operator      | User Agent          |
| ---------------- | ------------- | ------------------- |
| Claude-SearchBot | Anthropic     | `Claude-SearchBot`  |
| OAI-SearchBot    | OpenAI        | `OAI-SearchBot`     |
| PerplexityBot    | Perplexity AI | `PerplexityBot/1.0` |

### User-Triggered Assistants (fetch on user request)

| Bot                  | Operator   | User Agent             |
| -------------------- | ---------- | ---------------------- |
| Claude-User          | Anthropic  | `Claude-User`          |
| ChatGPT-User         | OpenAI     | `ChatGPT-User`         |
| Gemini-Deep-Research | Google     | `Gemini-Deep-Research` |
| Perplexity-User      | Perplexity | `Perplexity-User`      |

### Autonomous AI Agents

| Bot                 | Operator | User Agent            |
| ------------------- | -------- | --------------------- |
| ChatGPT Agent       | OpenAI   | `ChatGPT Agent`       |
| GoogleAgent-Mariner | Google   | `GoogleAgent-Mariner` |
| NovaAct             | Amazon   | `NovaAct`             |

### PerplexityBot Details

- Full UA: `Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)`
- Purpose: surfaces and links websites in Perplexity results (NOT training)
- IP whitelist: [perplexity.com/perplexitybot.json](https://www.perplexity.com/perplexitybot.json)
- robots.txt changes take up to 24 hours
- Docs: [docs.perplexity.ai/guides/perplexitybot](https://docs.perplexity.ai/guides/perplexitybot)

All bots respect robots.txt.

---

## Structured Data (Schema.org JSON-LD)

### High-Impact Types for Dev Tools

**Organization** — site-wide identity:

```json
{
  "@context": "https://schema.org",
  "@type": "Organization",
  "name": "Tank",
  "url": "https://www.tankpkg.dev",
  "logo": "https://www.tankpkg.dev/logo.png",
  "sameAs": ["https://github.com/tankpkg/tank"],
  "description": "Security-first package manager for AI agent skills"
}
```

**WebSite** — with SearchAction for site search:

```json
{
  "@context": "https://schema.org",
  "@type": "WebSite",
  "name": "Tank",
  "url": "https://www.tankpkg.dev",
  "potentialAction": {
    "@type": "SearchAction",
    "target": "https://www.tankpkg.dev/skills?q={search_term_string}",
    "query-input": "required name=search_term_string"
  }
}
```

**TechArticle** — for documentation (better than Article for dev docs):

```json
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "headline": "Getting Started with Tank",
  "description": "Install and configure Tank for AI skill security",
  "proficiencyLevel": "Beginner",
  "dependencies": "Bun 1.0+",
  "datePublished": "2025-01-01",
  "dateModified": "2025-03-15",
  "author": { "@type": "Organization", "name": "Tank" }
}
```

**SoftwareApplication** — for skill detail pages:

```json
{
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "name": "Tank",
  "applicationCategory": "DeveloperApplication",
  "operatingSystem": "macOS, Linux, Windows",
  "offers": { "@type": "Offer", "price": "0", "priceCurrency": "USD" },
  "featureList": "Security scanning, MCP server, skill publishing, verification",
  "author": { "@type": "Organization", "name": "Tank" }
}
```

**FAQPage** — highest LLM citation potential (directly maps to Q&A format):

```json
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "What is Tank?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Tank is a security-first package manager for AI agent skills..."
      }
    }
  ]
}
```

**BreadcrumbList** — navigation context for LLMs:

```json
{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    { "@type": "ListItem", "position": 1, "name": "Docs", "item": "https://www.tankpkg.dev/docs" },
    { "@type": "ListItem", "position": 2, "name": "CLI", "item": "https://www.tankpkg.dev/docs/cli" }
  ]
}
```

### Citation Optimization Principles

1. FAQPage schema maps directly to how LLMs answer questions
2. Consistent author attribution with `sameAs` links
3. `dateModified` accuracy — LLMs prefer recent content
4. BreadcrumbList provides hierarchy context
5. `speakable` property marks text for AI reading
6. `hasPart`/`isPartOf` helps LLMs understand multi-page structures

### Google References

- [Article structured data](https://developers.google.com/search/docs/appearance/structured-data/article)
- [Software app structured data](https://developers.google.com/search/docs/appearance/structured-data/software-app)
- [FAQ structured data](https://developers.google.com/search/docs/appearance/structured-data/faqpage)
- [Breadcrumb structured data](https://developers.google.com/search/docs/appearance/structured-data/breadcrumb)

---

## Meta Tags & Headers for AI

### HTML Meta Tags

```html
<!-- Standard (AI crawlers read these) -->
<meta name="description" content="Concise description" />
<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1" />
<meta name="keywords" content="Tank, AI skills, Claude Code, Cursor, security" />

<!-- Open Graph -->
<meta property="og:title" content="Page Title" />
<meta property="og:description" content="Description" />
<meta property="og:type" content="article" />
<meta property="og:url" content="https://canonical-url" />
<meta property="og:image" content="https://url/og.png" />

<!-- Article (helps with citation dating) -->
<meta property="article:published_time" content="2025-01-01T00:00:00Z" />
<meta property="article:modified_time" content="2025-03-15T00:00:00Z" />

<!-- Twitter Card -->
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="Page Title" />

<!-- Canonical + alternate markdown -->
<link rel="canonical" href="https://www.tankpkg.dev/docs/getting-started" />
<link rel="alternate" type="text/markdown" href="/docs/getting-started.md" />
```

### HTTP Headers for Markdown Endpoints

```
Content-Type: text/markdown; charset=utf-8
X-Robots-Tag: noindex  # Prevent HTML/MD duplicate indexing
```

### Key Insight

No AI-specific meta tags are standardized yet. AI crawlers rely on standard HTML meta, Schema.org JSON-LD, clean semantic HTML, robots.txt, and llms.txt.

---

## Sitemap Best Practices

### What Google Actually Uses

- **Used:** `<loc>`, `<lastmod>` (if consistently accurate)
- **Ignored:** `<priority>`, `<changefreq>` — Google explicitly ignores these

### Rules

- Include `llms.txt` and `llms-full.txt` in sitemap
- Accurate `<lastmod>` dates only — update when content actually changes
- Skip `<priority>` and `<changefreq>`
- Limit: 50,000 URLs or 50MB uncompressed per file
- UTF-8, fully-qualified absolute URLs, canonical URLs only
- Reference in robots.txt: `Sitemap: https://www.tankpkg.dev/sitemap.xml`

### Google docs

- [Build a sitemap](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap)

---

## OG Image Generation in TanStack Start

### Server Route Pattern

Source: [gvizo.so/posts/tanstack-start-dynamic-og-images](https://www.gvizo.so/posts/tanstack-start-dynamic-og-images)

```tsx
// src/routes/og[.]png.ts — escaped dot for /og.png URL
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/og.png")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { ImageResponse } = await import("@vercel/og"); // dynamic import
        return new ImageResponse(<OgComponent />, {
          width: 1200,
          height: 630,
          headers: { "Cache-Control": "public, max-age=86400, s-maxage=86400" },
        });
      },
    },
  },
});
```

### Library Options

| Library                      | Approach                            | Notes                                   |
| ---------------------------- | ----------------------------------- | --------------------------------------- |
| `@vercel/og`                 | ImageResponse API (same as next/og) | Most established, works outside Next.js |
| `satori` + `@resvg/resvg-js` | JSX → SVG → PNG                     | Lower-level, more control               |
| `@takumi-rs/image-response`  | Rust/WASM alternative to satori     | Newer, less community support           |

### Constraints

- Flexbox-only layout (no CSS grid)
- Inline style objects only (no Tailwind, no class names)
- Dynamic import required (keeps client bundle clean)
- OG generators must never throw — fall back to defaults
- Standard dimensions: 1200x630 px
- For Vercel: may need `nitro.externals.traceInclude` for native binaries

### PR #185 Constraints (from `.idd/modules/web-seo/INTENT.md`)

| #   | Rule                                                          |
| --- | ------------------------------------------------------------- |
| C1  | OG image URLs must resolve (never 404)                        |
| C2  | 1200x630 px dimensions                                        |
| C5  | Fast cold starts (server route, not SSR)                      |
| C6  | og:title, og:description, og:url, og:type on ALL public pages |
| C7  | twitter:card = summary_large_image on all public pages        |
| C8  | OG generators must never throw — fall back to defaults        |

---

## TanStack.com Patterns Worth Adopting

Source: [github.com/TanStack/tanstack.com](https://github.com/TanStack/tanstack.com)

### Plain Markdown Endpoints

Every doc page has a `.md` variant at `/{path}.md`:

- Returns `Content-Type: text/markdown`
- Accepts `framework` and `pm` query params for filtering
- CDN cached 5 min with stale-while-revalidate

### Hidden AI-Friendly Links

Every doc page includes:

```html
<a href="{path}.md" class="sr-only" aria-hidden="true">
  AI/LLM: This documentation page is available in plain markdown format at {path}.md
</a>
```

### CopyPageDropdown

Dropdown with AI integration options:

- Copy page (markdown to clipboard)
- View as Markdown (opens .md version)
- Open in Claude, ChatGPT, T3 Chat, Cursor

### Table of Contents

- Rehype plugin extracts h2-h6 headings with IDs
- IntersectionObserver tracks active heading (threshold 0.2)
- Sticky sidebar with framework-specific filtering
- `aria-current="location"` for accessibility

### CDN Caching Strategy

- Docs layout: `CDN-Cache-Control: max-age=300, stale-while-revalidate=300, durable`
- Latest docs: `Cache-Control: public, max-age=60, must-revalidate`
- Older versions: `Cache-Control: public, max-age=3600, must-revalidate`
- llms.txt: `CDN-Cache-Control: max-age=86400, stale-while-revalidate=86400, durable`

---

## How Leading Dev Tools Optimize for AI

### Common Patterns

1. Hierarchical organization with clear categories
2. One-line descriptions per link in llms.txt
3. Consistent URL patterns
4. Markdown format throughout
5. Separation of index (llms.txt) from full content (llms-full.txt)
6. Versioned documentation with version metadata
7. JSON-LD structured data on all public pages
8. Explicit AI crawler allowlists in robots.txt

### Emerging Patterns

- Versioned llms.txt per major release (Next.js)
- Agent instruction sections (Stripe)
- `@doc-version` metadata in llms.txt headers
- Content-Type negotiation (same URL returns HTML or markdown based on Accept header)
- Built-in MCP servers for programmatic AI agent access (TanStack)

---

## Implementation Checklist for Tank

### Foundation

- [ ] `/llms.txt` with LLM agent instructions section
- [ ] `/llms-full.txt` with all 17 docs concatenated
- [ ] robots.txt with explicit AI crawler rules
- [ ] Include llms.txt and llms-full.txt in sitemap

### Structured Data

- [ ] Organization + WebSite JSON-LD on root route
- [ ] TechArticle JSON-LD on doc pages
- [ ] SoftwareApplication JSON-LD on skill pages
- [ ] FAQPage JSON-LD on homepage
- [ ] BreadcrumbList JSON-LD on all pages

### Content Optimization

- [ ] `.md` endpoint for every doc page
- [ ] `<link rel="alternate" type="text/markdown">` headers
- [ ] Hidden sr-only AI links on doc pages
- [ ] article:published_time / article:modified_time on docs
- [ ] Canonical URLs on all public routes

### OG Images

- [ ] Homepage OG image server route
- [ ] Per-skill dynamic OG image route
- [ ] og:image meta tag on all public routes

### Monitoring

- [ ] Monitor AI crawler access in server logs (filter by user agents above)
- [ ] Track which pages AI search engines cite
