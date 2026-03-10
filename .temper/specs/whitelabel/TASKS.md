# White-Label Tasks

**Phase 1: Core Infrastructure**

- [x] **1.1** Create `BrandConfig` types in `packages/shared/src/brand.ts`
- [x] **1.2** Create `apps/web/lib/branding.ts` with `getBrandConfig()` function
- [x] **1.3** Add all `BRAND_*` env vars to `apps/web/.env.example`
- [x] **1.4** Add CSS custom properties `--brand-*` in `apps/web/app/globals.css`
- [x] **1.5** Create `BrandProvider` client component for color injection
- [x] **1.6** Export brand types from `packages/shared/src/index.ts`

**Phase 2: Component Updates**

- [x] **2.1** Create `Logo` component (`apps/web/components/logo.tsx`)
- [x] **2.2** Update `Header` to use dynamic `Logo` and brand name
- [x] **2.3** Update `Footer` with mandatory "Powered by Tank" link
- [x] **2.4** Find all static "Tank" text references in components
- [x] **2.5** Update auth pages (login, signup, forgot-password)
- [x] **2.6** Update landing page hero section
- [x] **2.7** Update dashboard sidebar/header
- [x] **2.8** Update admin pages

