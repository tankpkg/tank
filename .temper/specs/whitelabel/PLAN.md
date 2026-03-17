# White-Label Implementation Plan

**Feature:** White-Label Platform
**Estimated Effort:** 15-22 hours
**Parallelization:** Medium (some phases can overlap)

---

## Execution Strategy

1. **Bottom-up** — Start with shared types and config infrastructure
2. **Component-first** — Update components before pages
3. **Meta last** — SEO/meta tags depend on config being stable
4. **Test incrementally** — Each phase should be independently testable

---

## Phase 1: Core Infrastructure

**Goal:** Establish configuration layer that all components will consume

### Tasks

| #   | Task                                                          | File(s)                                              | Est. |
| --- | ------------------------------------------------------------- | ---------------------------------------------------- | ---- |
| 1.1 | Create `BrandConfig` types in `@internals/schemas`            | `packages/internals-schemas/src/brand.ts`            | 20m  |
| 1.2 | Create `apps/registry-legacy/lib/branding.ts` config accessor | `apps/registry-legacy/lib/branding.ts`               | 30m  |
| 1.3 | Add env vars to `.env.example`                                | `apps/registry-legacy/.env.example`                  | 10m  |
| 1.4 | Add CSS custom properties for theme colors                    | `apps/registry-legacy/app/globals.css`               | 20m  |
| 1.5 | Create `BrandProvider` client context                         | `apps/registry-legacy/components/brand-provider.tsx` | 30m  |
| 1.6 | Export brand types from shared package                        | `packages/internals-schemas/src/index.ts`            | 5m   |

**Deliverable:** `getBrandConfig()` function returning typed config with defaults

---

## Phase 2: Component Updates

**Goal:** All UI components use dynamic brand config

### Tasks

| #   | Task                                          | File(s)                                      | Est. |
| --- | --------------------------------------------- | -------------------------------------------- | ---- |
| 2.1 | Create `Logo` component                       | `apps/registry-legacy/components/logo.tsx`   | 30m  |
| 2.2 | Update `Header` to use `Logo` component       | `apps/registry-legacy/components/header.tsx` | 20m  |
| 2.3 | Update `Footer` with "Powered by Tank"        | `apps/registry-legacy/components/footer.tsx` | 30m  |
| 2.4 | Find/replace static "Tank" text in components | Various components                           | 1h   |
| 2.5 | Update auth pages (login, signup)             | `apps/registry-legacy/app/(auth)/*`          | 30m  |
| 2.6 | Update landing page hero                      | `apps/registry-legacy/app/page.tsx`          | 20m  |

**Deliverable:** All visible branding is dynamic via config

---

## Phase 3: Meta & SEO

**Goal:** Dynamic meta tags, OG images, and PWA manifest

### Tasks

| #   | Task                             | File(s)                                           | Est. |
| --- | -------------------------------- | ------------------------------------------------- | ---- |
| 3.1 | Update root layout metadata      | `apps/registry-legacy/app/layout.tsx`             | 30m  |
| 3.2 | Update OG image generation route | `apps/registry-legacy/app/og/[...name]/route.tsx` | 40m  |
| 3.3 | Create dynamic manifest route    | `apps/registry-legacy/app/manifest.ts`            | 30m  |
| 3.4 | Update sitemap generation        | `apps/registry-legacy/app/sitemap.ts`             | 15m  |
| 3.5 | Update robots.txt if needed      | `apps/registry-legacy/app/robots.ts`              | 10m  |

**Deliverable:** All SEO/meta reflects custom brand

---

## Phase 4: Email Templates

**Goal:** Branded email notifications

### Tasks

| #   | Task                              | File(s)                                     | Est. |
| --- | --------------------------------- | ------------------------------------------- | ---- |
| 4.1 | Audit existing email templates    | `apps/registry-legacy/lib/email/*`          | 20m  |
| 4.2 | Add brand config to email service | `apps/registry-legacy/lib/email/service.ts` | 30m  |
| 4.3 | Update email templates with brand | Email templates                             | 1h   |

**Deliverable:** Emails show custom brand name/logo

---

## Phase 5: Documentation

**Goal:** Self-hoster setup guide

### Tasks

| #   | Task                                   | File(s)                            | Est. |
| --- | -------------------------------------- | ---------------------------------- | ---- |
| 5.1 | Create white-label setup guide         | `docs/self-hosting/white-label.md` | 1h   |
| 5.2 | Update main self-hosting docs          | `docs/self-hosting/README.md`      | 30m  |
| 5.3 | Add brand asset checklist              | `docs/self-hosting/assets.md`      | 30m  |
| 5.4 | Update README with white-label mention | `README.md`                        | 15m  |

**Deliverable:** Complete setup documentation

---

## File Changes Summary

### New Files (6)

```
apps/registry-legacy/lib/branding.ts
apps/registry-legacy/components/logo.tsx
apps/registry-legacy/components/brand-provider.tsx
apps/registry-legacy/app/manifest.ts (dynamic)
packages/internals-schemas/src/brand.ts
docs/self-hosting/white-label.md
```

### Modified Files (35-45)

```
apps/registry-legacy/app/layout.tsx
apps/registry-legacy/app/page.tsx
apps/registry-legacy/app/globals.css
apps/registry-legacy/app/(auth)/*/page.tsx (5 files)
apps/registry-legacy/app/(dashboard)/layout.tsx
apps/registry-legacy/app/(admin)/layout.tsx
apps/registry-legacy/app/og/[...name]/route.tsx
apps/registry-legacy/components/header.tsx
apps/registry-legacy/components/footer.tsx
apps/registry-legacy/lib/email/service.ts
...and ~25 more component files with "Tank" text
```

---

## Testing Strategy

### Manual Testing

1. Set all `BRAND_*` env vars
2. Verify logo, name, colors appear correctly
3. Check meta tags in page source
4. Test PWA manifest
5. Verify "Powered by Tank" visible
6. Test OG image generation

### Automated Testing

- Unit test for `getBrandConfig()` defaults
- Unit test for `getBrandConfig()` with env vars
- Component snapshot tests with custom brand

---

## Rollout Plan

1. **Develop on feature branch** `feat/whitelabel`
2. **Test with Acme brand** (example company)
3. **Deploy to staging** with custom brand
4. **Update docs** before merge
5. **Merge to main** with default Tank branding
6. **Announce** in release notes

---

## Risk Mitigation

| Risk                      | Mitigation                           |
| ------------------------- | ------------------------------------ |
| Layout shift on logo load | Preload logo, use aspect-ratio       |
| XSS via brand URLs        | Validate URLs, use Next.js Image     |
| Missing env var           | Graceful fallback to Tank default    |
| Color contrast issues     | Document recommended contrast ratios |
