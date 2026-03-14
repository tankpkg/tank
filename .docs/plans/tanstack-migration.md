# TanStack Start Migration Plan

Next.js 16 (`apps/web`) → TanStack Start (`apps/web-tanstack`). Foundation complete, feature migration pending.

## What's Done

### Foundation (Step 0)
- **SSR QueryClient**: Request-scoped in `getRouter()`, no data leak between users
- **SSR Query**: `setupRouterSsrQueryIntegration` wired — auto dehydration/hydration + `QueryClientProvider`
- **Better Auth → Hono**: Auth mounted in `api/app.ts` via `app.on(['GET','POST','PUT','DELETE','PATCH'], '/auth/**', (c) => auth.handler(c.req.raw))`. `tanstackStartCookies()` removed. CORS with `credentials: true` and `origin: (origin) => origin` registered before auth routes.
- **Devtools**: `ReactQueryDevtools` + `TanStackRouterDevtools` in `__root.tsx` shell
- **Canonical API routing**: `routes/api/$.ts` catch-all → Hono `app.fetch(request)`. `server.ts` is default (`fetch: handler.fetch`). No custom intercept.
- **Nitro**: `nitro()` plugin in `vite.config.ts` (official pattern per TanStack Start examples)
- **Folder structure**: `api/` = Hono HTTP routes, `server-fns/` = TanStack Start server functions, `screens/` = portable React components, `layouts/` = layout shells
- **Tailwind v4**: `@theme` tokens in `global.css` — `text-forest`, `bg-lime`, `border-forest/10` (no `var()` wrapper needed)
- **shadcn/ui**: `components.json` created, TanStack Start preset (radix-nova), `components/ui/` owns button, card, input, label
- **Biome**: Root `biome.json` replaces ESLint. `tailwindDirectives: true` for CSS. Prettier kept only for `.md`, `.feature`, `.yaml`, `.yml`
- **motion**: Installed (v12.36.0), replaces `tw-animate-css` when we build animated UI

### Auth Enforcement (Step 1)
- **`lib/auth-helpers.ts`**: Ported from Next.js — `verifyCliAuth`, `resolveRequestUserId`, `canReadSkill`, `isUserBlocked`, `getUserModerationStatus`, `getSessionFromRequest`, `isAdmin`. Zero Next.js deps.
- **Hono middleware**: `api/middleware/require-auth.ts` (API key or session → 401), `api/middleware/require-admin.ts` (session + admin role → 403). Wired in `api/app.ts` before v1/admin routes.
- **Layout route guards**: `_dashboard.tsx` (`beforeLoad` → `getSession()` → redirect `/login`), `_admin.tsx` (`beforeLoad` → `getAdminSession()` → redirect)
- **Server functions**: `server-fns/auth.ts` — `getSession()` and `getAdminSession()` use `createServerFn` + `getRequestHeaders()` for SSR-safe session checks

### Screens & Layouts (Step 2)
- **Registry layout**: `layouts/registry-layout.tsx` — navbar (Tank logo, Home, Skills, Docs, Login) + footer, wraps public pages via `_registry.tsx` pathless layout route
- **Home screen**: `screens/home/home-screen.tsx` — receives `publicSkillCount` via props, no router dependency
- **Route pattern**: Thin route files (loader + head + mount screen). Example: `routes/_registry/index.tsx` → `HomeScreen`
- **Root**: `__root.tsx` is just HTML shell + devtools. Layout logic in `_registry.tsx`, `_dashboard.tsx`, `_admin.tsx`

## Architecture

```
src/
  api/                          # Hono HTTP API layer
    app.ts                      # Hono instance, CORS, auth mount, route mounting
    middleware/
      require-auth.ts           # API key or session → c.set('userId') or 401
      require-admin.ts          # Session + admin role → c.set('adminUser') or 403
    routes/
      health.ts                 # GET /api/health
      v1.ts                     # Scaffold — needs full implementation
      admin.ts                  # Scaffold — needs full implementation
  server-fns/                   # TanStack Start server functions (RPC from client)
    auth.ts                     # getSession(), getAdminSession()
    homepage.ts                 # getHomepageStats()
  screens/                      # Portable React components (receive data via props)
    home/home-screen.tsx
  layouts/                      # Layout shells (navbar, sidebar, footer)
    registry-layout.tsx
  components/                   # Shared UI primitives
    ui/                         # shadcn components
    homepage/icon-badge.tsx
  consts/                       # Constants (brand, homepage copy)
  lib/                          # Infra, config, DB, auth, utilities
    auth.ts                     # Better Auth config (Drizzle adapter, plugins)
    auth-client.ts              # Client-side auth (signIn, signOut, useSession)
    auth-helpers.ts             # Framework-agnostic auth verification
    db.ts                       # Drizzle ORM connection
    db/schema.ts                # Application tables
    db/auth-schema.ts           # Better Auth tables (auto-generated)
    config-validation.ts        # Startup env validation
    email/                      # Email service + rate limiter
    storage/provider.ts         # Supabase/S3 storage abstraction
    redis.ts, supabase.ts, logger.ts
    query/homepage-options.ts   # React Query option factories
    utils.ts                    # cn() helper
  routes/
    __root.tsx                  # HTML shell + devtools
    _registry.tsx               # Public layout (navbar/footer)
    _registry/
      index.tsx                 # / → HomeScreen
      login.tsx                 # /login (placeholder)
      skills.index.tsx          # /skills (placeholder)
      docs.index.tsx            # /docs (placeholder)
    _dashboard.tsx              # Protected layout (session guard)
    _dashboard/dashboard.tsx    # /dashboard (placeholder)
    _admin.tsx                  # Admin layout (admin guard)
    _admin/admin.tsx            # /admin (placeholder)
    api/$.ts                    # Catch-all → Hono
  styles/global.css             # Tailwind @theme + shadcn tokens
  router.tsx                    # TanStack Router + QueryClient + SSR query
  server.ts                     # Default server entry (no custom logic)
```

## Critical Patterns Learned

### TanStack Start
- `beforeLoad` runs on BOTH server and client. Server-only code (DB, auth) must be wrapped in `createServerFn` — otherwise it gets bundled into the client and fails.
- `getRequestHeaders()` from `@tanstack/react-start/server` gives access to request headers inside server functions (for session cookie reading).
- `setupRouterSsrQueryIntegration({ router, queryClient })` auto-wraps with `QueryClientProvider` — don't add it manually in `__root.tsx`.
- Pathless layout routes (`_registry.tsx`) need child routes in a matching `_registry/` directory.
- `server.handlers` with `server: { handlers: { GET, POST, ... } }` is the canonical way to create API routes.
- TanStack Start embeds nitro, but the official examples still include `nitro()` in vite.config.ts as a plugin.

### Hono
- CORS must be registered BEFORE auth routes with `credentials: true`.
- Pass `c.req.raw` to Better Auth's handler (standard Request, not Hono context).
- RPC type inference requires chained method syntax: `new Hono().get().post()` — separate calls lose types.
- `@hono/zod-validator` works with Zod v4 via Standard Schema — zero adapter code.

### Better Auth
- `tanstackStartCookies()` is NOT needed when auth runs in Hono — cookies flow through standard HTTP.
- `auth.api.getSession({ headers })` is a direct internal call (no HTTP round-trip) — works from any server context.
- `auth.api.verifyApiKey({ body: { key: token } })` for CLI API key verification.
- Run `npx auth@latest generate` after adding any plugin.

### Tailwind v4
- CSS-first config via `@theme` directives. No `tailwind.config.js`.
- Colors: `--color-forest: #0e3928` → use as `text-forest`, `bg-forest`, `border-forest/10`.
- Dark mode: `@variant dark { --color-background: oklch(...); }`.
- `@import "tailwindcss"` — plain, no `source()` function needed.

### Biome
- `tailwindDirectives: true` in CSS parser for `@theme`, `@custom-variant`, `@apply`.
- `noConsole` override for `packages/cli/**` and `scripts/**` (CLI is supposed to log).
- Prettier kept only for `.md`, `.feature`, `.yaml`, `.yml` (Biome doesn't handle these).

### Zod v4
- Standard Schema — works natively with Hono validators, TanStack Form, TanStack Router, content-collections.
- `safeParse()` never `parse()` (project gotcha).
- Breaking changes from v3: `.email()` → `z.email()`, `.strict()` deprecated, `.merge()` deprecated.

## Remaining Steps

### Step 4: Port v1 API Routes (P0 — CLI depends on this)

Port from `apps/web/app/api/v1/` to `apps/web-tanstack/src/api/routes/v1/`:

| Next.js Route | Hono Route | Methods |
|---------------|-----------|---------|
| `skills/route.ts` | `v1/skills.ts` | POST (publish), POST confirm |
| `skills/[name]/route.ts` | `v1/skills-read.ts` | GET skill metadata |
| `skills/[name]/versions/route.ts` | `v1/skills-read.ts` | GET versions |
| `skills/[name]/[version]/route.ts` | `v1/skills-read.ts` | GET specific version |
| `skills/[name]/[version]/files/[...path]/route.ts` | `v1/skills-read.ts` | GET file download |
| `skills/[name]/star/route.ts` | `v1/star.ts` | POST/DELETE star |
| `skills/confirm/route.ts` | `v1/skills.ts` | POST confirm publish |
| `search/route.ts` | `v1/search.ts` | GET search |
| `scan/route.ts` | `v1/scan.ts` | POST trigger scan |
| `badge/[...name]/route.ts` | `v1/badge.ts` | GET security badge SVG |
| `cli-auth/start/route.ts` | `v1/cli-auth.ts` | POST start device flow |
| `cli-auth/authorize/route.ts` | `v1/cli-auth.ts` | POST authorize |
| `cli-auth/exchange/route.ts` | `v1/cli-auth.ts` | POST exchange code for token |
| `auth/whoami/route.ts` | `v1/whoami.ts` | GET current user |

**Key dependency**: `apps/web/lib/data/skills.ts` — largest data-access file. Must be ported to `lib/data/skills.ts` with Next.js deps removed (`next/headers`, `next/cache` → accept `Request` param).

Also port: `cli-auth-store.ts`, `permission-escalation.ts`, `audit-score.ts` (all pure logic, no Next.js deps).

### Step 4.3: Port Admin API Routes

Port from `apps/web/app/api/admin/` to `api/routes/admin/`:
- users (list, detail, status moderation)
- orgs (list, detail, member management)
- packages (list, detail, status)
- service-accounts (list, key management)
- audit-logs (list)
- rescan-skills (trigger)

All use `requireAdmin` middleware.

### Step 5: Auth UI

- Port login page from `apps/web/app/(auth)/login/page.tsx` → `screens/auth/login-screen.tsx`
- Port CLI device flow authorization UI → `screens/auth/cli-login-screen.tsx`
- Use `better-auth/react` client hooks: `signIn`, `signOut`, `useSession`

### Step 6: Registry UI

- Skills listing: server function + query options + `screens/skills/skills-list-screen.tsx`
- Skill detail: server function + `screens/skill-detail/skill-detail-screen.tsx`
- Security components: port from `apps/web/components/security/` (5 components)
- Scoped package names (`@scope/name`): test TanStack Router splat route with `@` character

### Step 7: Dashboard & Admin UI

- Dashboard: tokens, orgs, org detail, accept invitation
- Admin: users, orgs, packages, service accounts, audit logs
- Each follows thin route + screen pattern

### Step 8: Docs (MDX Rendering)

Use `content-collections` with `@content-collections/vinxi` adapter (NOT `@content-collections/vite`):
- Port 18 MDX files from `apps/web/content/docs/`
- Unified pipeline: `remarkParse → remarkGfm → remarkRehype → rehypeRaw → rehypeSlug → rehypeStringify`
- Shiki for syntax highlighting
- Custom docs layout with sidebar + TOC

### Step 9: Polish & Parity

- SEO: `head()` with meta, OG, JSON-LD per route
- OG images: `satori` + `resvg-wasm` in Hono route (replaces `next/og`)
- robots.txt, sitemap.xml as Hono routes
- PostHog analytics + cookie consent
- Command menu (cmdk)

### Step 10: deps.md Update

Expand `apps/web-tanstack` section with all deps, Vite 8 compat matrix, shared vs unique deps.

## Vite 8 Status

Blocked by `@tailwindcss/vite@4.2.1` (latest) — supports `^5.2 || ^6 || ^7` only. All other deps support Vite 8:
- `@tanstack/react-start` 1.166.8: `>=7.0.0` ✓
- `nitro` 3.0.260311-beta: `^7 || ^8` ✓
- `@vitejs/plugin-react` 5.2.0: `^4.2 || ... || ^8` ✓

Wait for Tailwind to ship Vite 8 support.

## Data Serialization Gotcha

TanStack Start serializes loader data between server and client. `Date` objects become ISO strings. Screen components must handle `string` dates, not `Date` objects.

## Unresolved Questions

1. Does `/skills/@scope/name` work as a splat route in TanStack Router, or does `@` need URL encoding?
2. Does SSR session reading work without `tanstackStartCookies()` in production? (Test when login UI is built)
3. Is `@content-collections/vinxi` published and stable? Fallback: plain vite adapter.
4. Fumadocs MDX frontmatter compatibility with content-collections schema.
