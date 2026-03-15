# White-Label Platform Specification

**Status:** Draft
**Created:** 2026-03-10
**Complexity:** Medium
**Risk:** Low (additive feature, no breaking changes)

---

## Intent

Enable self-hosted Tank deployments to rebrand the web registry while maintaining "Powered by Tank" attribution. The CLI remains branded as Tank — only the web UI is customizable.

## Scope

### In Scope

- Product name customization
- Logo, favicon, and icon customization
- Color theme customization (primary, secondary, accent)
- Meta tags (title, description, OG tags)
- PWA manifest branding
- Email template branding
- "Powered by Tank" footer (mandatory)

### Out of Scope

- CLI branding (remains Tank)
- MCP server messages (remains Tank)
- Core functionality changes
- Multi-tenant support (single brand per deployment)

---

## Configuration Schema

### Environment Variables

```bash
# Brand Configuration
BRAND_NAME="Acme Skills"                    # Product name (default: "Tank")
BRAND_TAGLINE="Enterprise AI Skills Hub"    # Tagline (default: Tank's tagline)
BRAND_URL="https://skills.acme.com"         # Public URL (default: https://tankpkg.dev)

# Visual Assets (URLs or local paths)
BRAND_LOGO_URL="/brand/logo.png"            # Main logo
BRAND_LOGO_TIGHT_URL="/brand/logo-tight.png" # Compact logo
BRAND_FAVICON_URL="/brand/favicon.ico"      # Favicon
BRAND_OG_IMAGE_URL="/brand/og-default.png"  # Default OG image

# Color Theme (hex without #)
BRAND_COLOR_PRIMARY="10b981"                # Primary color (default: emerald)
BRAND_COLOR_SECONDARY="3b82f6"              # Secondary color
BRAND_COLOR_ACCENT="f59e0b"                 # Accent/highlight color
BRAND_COLOR_BACKGROUND="0f172a"             # Background color

# Social Links
BRAND_TWITTER="@acme"                       # Twitter handle
BRAND_GITHUB="acme/skills-registry"         # GitHub org/repo
BRAND_SUPPORT_EMAIL="support@acme.com"      # Support email

# Feature Flags
BRAND_SHOW_POWERED_BY="true"                # Always true for compliance
```

### Runtime Config API

```typescript
// apps/web/lib/branding.ts
interface BrandConfig {
  name: string;
  tagline: string;
  url: string;
  logo: { default: string; tight: string };
  favicon: string;
  ogImage: string;
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
  };
  social: {
    twitter?: string;
    github?: string;
    email?: string;
  };
  poweredBy: {
    name: "Tank";
    url: "https://tankpkg.dev";
    required: true;
  };
}
```

---

## Blast Radius Analysis

### Files Modified (Est. 35-45 files)

| Category       | Files                                                       | Impact                    |
| -------------- | ----------------------------------------------------------- | ------------------------- |
| **Layouts**    | `apps/web/app/layout.tsx`, all route group layouts          | Meta tags, title template |
| **Components** | `Header.tsx`, `Footer.tsx`, `Logo.tsx`, `ThemeProvider.tsx` | Dynamic branding          |
| **Pages**      | Landing, auth pages, dashboard                              | Static text → config refs |
| **API Routes** | OG image generation, manifest, sitemap                      | Dynamic brand data        |
| **Emails**     | Email templates (if any)                                    | Brand colors/logo         |
| **Config**     | `lib/branding.ts` (new)                                     | Central config accessor   |
| **Types**      | `@tank/shared`                                              | Shared brand types        |

### Consumers Affected

| Consumer     | Impact   | Migration                    |
| ------------ | -------- | ---------------------------- |
| Self-hosters | **High** | Set env vars, add logo files |
| Tank SaaS    | **Low**  | Defaults to Tank branding    |
| CLI users    | **None** | CLI unchanged                |
| MCP users    | **None** | MCP unchanged                |

### Contracts

| Contract      | Change              | Breaking?             |
| ------------- | ------------------- | --------------------- |
| Web UI        | Branding dynamic    | No (defaults to Tank) |
| Meta tags     | Dynamic from config | No                    |
| PWA manifest  | Dynamic from config | No                    |
| API responses | No change           | No                    |

### Architectural Drift Risk

**Low** — This is a configuration layer over existing components, not an architectural change. The default behavior (Tank branding) remains identical.

---

## Implementation Phases

### Phase 1: Core Infrastructure (Est. 4-6 hours)

1. Create `apps/web/lib/branding.ts` with config accessor
2. Add brand-related env vars to `.env.example`
3. Create TypeScript types in `@tank/shared`
4. Add CSS custom properties for theme colors
5. Create brand context provider for client components

### Phase 2: Component Updates (Est. 6-8 hours)

1. Update `Header` component for dynamic logo/name
2. Update `Footer` with "Powered by Tank" (mandatory)
3. Create `Logo` component with brand config
4. Update all static "Tank" text references
5. Apply dynamic colors via CSS variables

### Phase 3: Meta & SEO (Est. 2-3 hours)

1. Update root layout for dynamic meta tags
2. Update OG image generation route
3. Update PWA manifest route
4. Update sitemap generation

### Phase 4: Email & Notifications (Est. 1-2 hours)

1. Update email templates (if custom)
2. Update any notification templates
3. Add brand colors to email styling

### Phase 5: Documentation (Est. 2-3 hours)

1. Create white-label setup guide
2. Update self-hosting docs
3. Add brand asset requirements
4. Document env var configuration

---

## Acceptance Criteria

### Functional

- [ ] Setting `BRAND_NAME` changes all visible product names
- [ ] Setting `BRAND_LOGO_URL` replaces logo everywhere
- [ ] Setting `BRAND_COLOR_*` changes theme colors
- [ ] "Powered by Tank" always visible in footer
- [ ] PWA manifest reflects custom brand
- [ ] OG images use custom brand assets
- [ ] Meta tags reflect custom brand

### Non-Functional

- [ ] Zero runtime overhead (config cached at startup)
- [ ] No layout shift on brand load
- [ ] Graceful fallback to Tank defaults
- [ ] Type-safe configuration

### Security

- [ ] No XSS via brand config (sanitized URLs)
- [ ] Logo URLs validated against allowed origins
- [ ] No sensitive data in brand config

---

## Unresolved Questions

1. **Logo upload flow** — Should self-hosters upload logos via UI, or file system only?
2. **Email deliverability** — Custom domain SPF/DKIM setup documentation needed?
3. **Dark mode colors** — Should we support separate dark mode brand colors?

---

## Dependencies

- None (pure configuration layer)

## Rollback

Trivial — remove env vars, defaults to Tank branding.
