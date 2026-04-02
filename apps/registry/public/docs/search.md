---
title: Searching for Skills
description: Find AI agent skills in the Tank registry using hybrid fuzzy search with typo tolerance, full-text matching, and advanced filters for security score, popularity, and freshness.
---

# Searching for Skills

Tank provides three ways to find AI agent skills: the CLI, the web UI, and the REST API. All three methods query the same underlying search index and return the same results — choose whichever fits your workflow.

<div class="my-6 flex justify-center overflow-x-auto">
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 230" class="max-w-full" style="font-family: 'Space Grotesk', sans-serif;">
  <defs>
    <marker id="s-arrow" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto"><path d="M0,0 L8,3 L0,6" fill="#64748b"/></marker>
    <marker id="s-arrow-green" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto"><path d="M0,0 L8,3 L0,6" fill="#16a34a"/></marker>
  </defs>
  <!-- Query with typo -->
  <rect x="15" y="12" width="150" height="52" rx="10" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="90" y="31" text-anchor="middle" fill="currentColor" font-size="11" font-weight="600">User query</text>
  <text x="90" y="50" text-anchor="middle" fill="#dc2626" font-size="11" font-weight="600">"vercel deplyo"</text>
  <!-- Arrows to 3 tiers -->
  <line x1="165" y1="28" x2="205" y2="28" stroke="#64748b" stroke-width="1.5" marker-end="url(#s-arrow)"/>
  <line x1="165" y1="38" x2="205" y2="93" stroke="#64748b" stroke-width="1.5" marker-end="url(#s-arrow)"/>
  <line x1="165" y1="48" x2="205" y2="158" stroke="#64748b" stroke-width="1.5" marker-end="url(#s-arrow)"/>
  <!-- Tier 1: ILIKE — no match -->
  <rect x="210" y="5" width="270" height="44" rx="8" fill="none" stroke="#64748b" stroke-width="1.5" stroke-dasharray="4,3"/>
  <text x="300" y="23" text-anchor="middle" fill="#64748b" font-size="10" font-weight="600">Tier 1: ILIKE exact/substring</text>
  <text x="300" y="38" text-anchor="middle" fill="#64748b" font-size="9">No exact text match for the typo</text>
  <rect x="400" y="12" width="65" height="28" rx="6" fill="none" stroke="#64748b" stroke-width="1"/>
  <text x="432.5" y="31" text-anchor="middle" fill="#64748b" font-size="11" font-weight="600">0 pts</text>
  <!-- Tier 2: pg_trgm — MATCH -->
  <rect x="210" y="66" width="270" height="56" rx="8" fill="none" stroke="#10b981" stroke-width="1.5"/>
  <text x="300" y="84" text-anchor="middle" fill="#10b981" font-size="10" font-weight="600">Tier 2: pg_trgm fuzzy match</text>
  <text x="300" y="100" text-anchor="middle" fill="currentColor" font-size="9">Finds "vercel-deploy" despite typo</text>
  <text x="300" y="113" text-anchor="middle" fill="#64748b" font-size="8">similarity 0.68 → 204 pts</text>
  <rect x="400" y="80" width="65" height="28" rx="6" fill="none" stroke="#10b981" stroke-width="1.5"/>
  <text x="432.5" y="99" text-anchor="middle" fill="#10b981" font-size="11" font-weight="600">204</text>
  <!-- Tier 3: tsvector — stem match -->
  <rect x="210" y="138" width="270" height="48" rx="8" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="300" y="156" text-anchor="middle" fill="currentColor" font-size="10" font-weight="600">Tier 3: tsvector stemming</text>
  <text x="300" y="172" text-anchor="middle" fill="currentColor" font-size="9">"deploy" stem also matches "deployment"</text>
  <rect x="400" y="148" width="65" height="28" rx="6" fill="none" stroke="currentColor" stroke-width="1"/>
  <text x="432.5" y="167" text-anchor="middle" fill="currentColor" font-size="11" font-weight="600">45</text>
  <!-- Sum arrows -->
  <line x1="480" y1="27" x2="560" y2="92" stroke="#64748b" stroke-width="1.5" marker-end="url(#s-arrow)"/>
  <line x1="480" y1="94" x2="560" y2="94" stroke="#64748b" stroke-width="1.5" marker-end="url(#s-arrow)"/>
  <line x1="480" y1="162" x2="560" y2="100" stroke="#64748b" stroke-width="1.5" marker-end="url(#s-arrow)"/>
  <!-- Combined box -->
  <rect x="565" y="72" width="90" height="44" rx="10" fill="none" stroke="#10b981" stroke-width="1.5"/>
  <text x="610" y="90" text-anchor="middle" fill="#10b981" font-size="10" font-weight="600">SUM</text>
  <text x="610" y="107" text-anchor="middle" fill="#10b981" font-size="12" font-weight="600">249 pts</text>
  <!-- Arrow to result -->
  <line x1="655" y1="94" x2="702" y2="94" stroke="#16a34a" stroke-width="2" marker-end="url(#s-arrow-green)"/>
  <!-- Result -->
  <rect x="715" y="60" width="170" height="68" rx="10" fill="none" stroke="#16a34a" stroke-width="1.5"/>
  <text x="800" y="82" text-anchor="middle" fill="#16a34a" font-size="12" font-weight="600">#1 vercel-deploy</text>
  <text x="800" y="99" text-anchor="middle" fill="currentColor" font-size="10">v2.3.1 · score 9.4</text>
  <text x="800" y="116" text-anchor="middle" fill="#64748b" font-size="9">12,400 downloads</text>
  <!-- Bottom note -->
  <rect x="170" y="194" width="560" height="24" rx="8" fill="none" stroke="#64748b" stroke-width="1" stroke-dasharray="4,3"/>
  <text x="450" y="210" text-anchor="middle" fill="#64748b" font-size="10">Typo tolerance + stemming = you find what you meant</text>
</svg>
</div>

## Three Ways to Search

| Method                          | Best For                                                 |
| ------------------------------- | -------------------------------------------------------- |
| `tank search "query"`           | Quick lookups while working in the terminal              |
| Web browse page + Cmd+K palette | Exploring the registry visually with filters             |
| `GET /api/v1/search`            | Programmatic discovery, custom tooling, MCP integrations |

## How Tank Search Works

<div class="my-6 flex justify-center overflow-x-auto">
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 150" class="max-w-full" style="font-family: 'Space Grotesk', sans-serif;">
  <defs>
    <marker id="sr-arrow" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto"><path d="M0,0 L8,3 L0,6" fill="#64748b"/></marker>
  </defs>
  <!-- Query -->
  <rect x="10" y="55" width="90" height="44" rx="10" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="55" y="82" text-anchor="middle" fill="currentColor" font-size="12" font-weight="600">Query</text>
  <!-- Fan-out -->
  <line x1="100" y1="67" x2="155" y2="22" stroke="#64748b" stroke-width="1.5" marker-end="url(#sr-arrow)"/>
  <line x1="100" y1="77" x2="155" y2="72" stroke="#64748b" stroke-width="1.5" marker-end="url(#sr-arrow)"/>
  <line x1="100" y1="87" x2="155" y2="122" stroke="#64748b" stroke-width="1.5" marker-end="url(#sr-arrow)"/>
  <!-- ILIKE box -->
  <rect x="165" y="8" width="200" height="40" rx="8" fill="none" stroke="#10b981" stroke-width="1.5"/>
  <text x="265" y="21" text-anchor="middle" fill="#10b981" font-size="11" font-weight="600">ILIKE prefix/substring</text>
  <text x="265" y="36" text-anchor="middle" fill="#64748b" font-size="10">400 pts max — exact match</text>
  <!-- pg_trgm box -->
  <rect x="165" y="54" width="200" height="40" rx="8" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="265" y="71" text-anchor="middle" fill="currentColor" font-size="11" font-weight="600">pg_trgm fuzzy</text>
  <text x="265" y="86" text-anchor="middle" fill="#64748b" font-size="10">300 pts max — handles typos</text>
  <!-- tsvector box -->
  <rect x="165" y="100" width="200" height="40" rx="8" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="265" y="121" text-anchor="middle" fill="currentColor" font-size="11" font-weight="600">tsvector full-text</text>
  <text x="265" y="136" text-anchor="middle" fill="#64748b" font-size="10">100 pts max — stemming</text>
  <!-- Merge arrows -->
  <line x1="365" y1="28" x2="440" y2="68" stroke="#64748b" stroke-width="1.5" marker-end="url(#sr-arrow)"/>
  <line x1="365" y1="74" x2="440" y2="74" stroke="#64748b" stroke-width="1.5" marker-end="url(#sr-arrow)"/>
  <line x1="365" y1="120" x2="440" y2="80" stroke="#64748b" stroke-width="1.5" marker-end="url(#sr-arrow)"/>
  <!-- SUM box -->
  <rect x="445" y="54" width="110" height="40" rx="10" fill="none" stroke="#10b981" stroke-width="1.5"/>
  <text x="485" y="71" text-anchor="middle" fill="#10b981" font-size="11" font-weight="600">SUM</text>
  <text x="485" y="86" text-anchor="middle" fill="#64748b" font-size="10">+ bonus pts</text>
  <!-- Arrow to ranked -->
  <line x1="535" y1="74" x2="575" y2="74" stroke="#64748b" stroke-width="1.5" marker-end="url(#sr-arrow)"/>
  <!-- Ranked Results -->
  <rect x="605" y="50" width="140" height="44" rx="10" fill="none" stroke="#16a34a" stroke-width="1.5"/>
  <text x="675" y="69" text-anchor="middle" fill="#16a34a" font-size="11" font-weight="600">Ranked Results</text>
  <text x="675" y="84" text-anchor="middle" fill="#64748b" font-size="10">ORDER BY score</text>
</svg>
</div>

Tank uses a **hybrid 3-tier ranking** system that combines multiple matching strategies into a single relevance score. This means you get useful results even with typos, partial words, or short queries.

### Tier 1 — ILIKE Prefix and Substring Matching (up to 400 pts)

The first pass does case-insensitive string matching against skill names and descriptions:

- **Prefix match** (`skill-name ILIKE 'query%'`): 400 points — the query matches the start of the name
- **Substring match** (`skill-name ILIKE '%query%'`): 200 points — the query appears anywhere in the name or description

This handles the common case where you know (or almost know) the exact name.

### Tier 2 — pg_trgm Fuzzy Matching (up to 300 pts)

PostgreSQL's `pg_trgm` extension computes trigram similarity between your query and skill names. Any skill with a similarity score above **0.15** is included, weighted by how closely it matches:

```
score = 300 × trigram_similarity(query, skill_name)
```

This is what handles typos: searching `"vercel deplyo"` still finds `vercel-deploy` because enough trigrams overlap. The GIN trigram index keeps this fast even as the registry grows.

### Tier 3 — Full-Text Search via tsvector (up to 100 pts)

Skills have a precomputed `searchVector` column (type `tsvector`) that indexes names, descriptions, and tags. PostgreSQL's `plainto_tsquery` converts your query into a full-text search expression and ranks matches using `ts_rank`:

```
score = 100 × ts_rank(search_vector, plainto_tsquery(query))
```

Full-text search handles multi-word queries well and understands stemming — searching `"deploys"` also matches skills about `"deployment"`.

### Bonus Points for High-Quality Matches

On top of the three tiers, Tank awards additional points for specific match types:

| Match Type                       | Bonus Points |
| -------------------------------- | ------------ |
| Exact name match                 | +1000        |
| Exact prefix match               | +800         |
| Scoped name match (`@org/skill`) | +600         |
| Substring match in name          | +400         |

The final score is the sum of all applicable points. Results are sorted descending by this score, then by download count as a tiebreaker.

<Callout type="info">
  The combined scoring means a skill with a slightly lower textual match but many downloads can rank above an obscure
  skill with a perfect name match. This surfaces battle-tested skills first, similar to how npm surfaces popular
  packages.
</Callout>

## Search Parameters

All three search interfaces accept the same filtering parameters:

| Parameter     | Type    | Default  | Description                                                              |
| ------------- | ------- | -------- | ------------------------------------------------------------------------ |
| `q`           | string  | —        | Search query. Supports partial words, typos, scoped names (`@org/skill`) |
| `page`        | integer | `1`      | Result page (1-indexed)                                                  |
| `limit`       | integer | `20`     | Results per page. Min: 1, Max: 50                                        |
| `sort`        | string  | `score`  | Sort order: `score`, `updated`, `downloads`, `stars`, `name`             |
| `visibility`  | string  | `public` | Filter by visibility: `all`, `public`, `private`                         |
| `scoreBucket` | string  | `all`    | Filter by audit score: `all`, `high` (7–10), `medium` (4–6), `low` (0–3) |

<Callout type="info">
  Filtering by `visibility=private` or `visibility=all` requires authentication. Unauthenticated requests are silently
  coerced to `visibility=public`.
</Callout>

## CLI Search

```bash
tank search "query"
```

The CLI prints a color-coded table of matching skills with their name, version, description, and audit score. Scores are color-coded:

- **Green** (7–10) — high quality, passes all checks
- **Yellow** (4–6) — medium quality, some checks failed
- **Red** (0–3) — low quality, significant issues found

### CLI Search Examples

```bash
# Search by keyword
tank search "browser automation"

# Search for a scoped skill
tank search "@vercel/deploy"

# Find skills related to code review
tank search "code review"
```

The CLI always returns public skills sorted by relevance score. For filtered results (by score bucket, sort order, etc.) use the web UI or API.

## Web Search

### Browse Page

The registry browse page at [tankpkg.dev/skills](/skills) lets you:

- Search with a full-text input
- Filter by **security score bucket** (High / Medium / Low)
- Sort by **Updated**, **Downloads**, **Stars**, or **Relevance**
- Page through results with keyboard navigation

### Command Palette (Cmd+K)

Press `Cmd+K` (macOS) or `Ctrl+K` (Windows/Linux) anywhere on the Tank website to open the command palette. Type to search skills instantly — results update as you type with no page reload.

The command palette searches skill names and descriptions with a 150ms debounce. It's the fastest way to jump directly to a skill's detail page.

## API Search

Use the search API directly for programmatic discovery, custom tooling, or building on top of Tank's registry.

### Request

```bash
curl "https://tankpkg.dev/api/v1/search?q=browser+automation&limit=5&sort=downloads" \
  -H "Authorization: Bearer $TANK_TOKEN"
```

### Parameters as Query String

```
GET /api/v1/search?q=browser+automation&page=1&limit=20&sort=score&scoreBucket=high
```

### Response

```json
{
  "results": [
    {
      "name": "@community/browser-automation",
      "version": "2.3.1",
      "description": "Playwright-based browser automation skill for AI agents",
      "author": "community",
      "downloads": 12400,
      "stars": 341,
      "auditScore": 9,
      "visibility": "public",
      "updatedAt": "2026-02-14T11:30:00Z",
      "score": 1700
    }
  ],
  "total": 23,
  "page": 1,
  "limit": 20,
  "pages": 2
}
```

### Searching Scoped Skills

The API handles scoped names correctly — `@org/skill` is tokenized as an org-scoped query:

```bash
# Find all skills from the vercel org
curl "https://tankpkg.dev/api/v1/search?q=%40vercel" \
  -H "Authorization: Bearer $TANK_TOKEN"

# Find a specific scoped skill
curl "https://tankpkg.dev/api/v1/search?q=%40vercel%2Fdeploy-skill" \
  -H "Authorization: Bearer $TANK_TOKEN"
```

### Filtering by Audit Score

Only install skills that pass Tank's security checks:

```bash
# Only return high-quality skills (score 7-10)
curl "https://tankpkg.dev/api/v1/search?q=web+scraping&scoreBucket=high"
```

<Callout type="warn">
  Skills with a `low` audit score (0–3) have significant security findings. Review `tank audit @org/skill-name`
  carefully before installing any low-scoring skill.
</Callout>

## Search Performance

Tank's search is designed to stay fast as the registry grows:

- **GIN index** on `searchVector` — full-text search is O(log n)
- **GIN trigram index** on skill names — fuzzy matching without sequential scans
- **Precomputed `searchVector`** — updated on publish, not at query time
- **Combined Drizzle query** — name, description, score, and download count fetched in a single round trip

Typical search latency is under 50ms at p99 for the hosted registry.

## Related

- [Installing Skills](/docs/installing) — install skills you find in search
- [Publishing Skills](/docs/publishing) — improve your skill's discoverability
- [API Reference](/docs/api) — full search API specification
