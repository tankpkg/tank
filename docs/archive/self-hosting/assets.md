# Brand Assets Checklist

Use this checklist when preparing your white-label brand assets.

## Logo Assets

- [ ] **Main Logo** (`logo.png`)
  - Size: 120×40px (or proportional)
  - Format: PNG with transparency or SVG
  - Path: `apps/registry-legacy/public/brand/logo.png`

- [ ] **Compact Logo** (`logo-tight.png`)
  - Size: 32×32px
  - Format: PNG with transparency or SVG
  - Path: `apps/registry-legacy/public/brand/logo-tight.png`

## Favicon

- [ ] **Favicon** (`favicon.ico`)
  - Size: 32×32px (include 16×16px variant)
  - Format: ICO or PNG
  - Path: `apps/registry-legacy/public/brand/favicon.ico`

- [ ] **Apple Touch Icon** (optional)
  - Size: 180×180px
  - Format: PNG
  - Path: `apps/registry-legacy/public/apple-touch-icon.png`

## Social Media

- [ ] **OpenGraph Image** (`og-default.png`)
  - Size: 1200×630px
  - Format: PNG
  - Path: `apps/registry-legacy/public/brand/og-default.png`

## Environment Variables

After placing assets, configure these variables:

```bash
# Identity
BRAND_NAME="Your Brand"
BRAND_TAGLINE="Your tagline here"
BRAND_URL="https://your-domain.com"

# Assets
BRAND_LOGO_URL="/brand/logo.png"
BRAND_LOGO_TIGHT_URL="/brand/logo-tight.png"
BRAND_FAVICON_URL="/brand/favicon.ico"
BRAND_OG_IMAGE_URL="/brand/og-default.png"

# Colors (hex without #)
BRAND_COLOR_PRIMARY="10b981"
BRAND_COLOR_SECONDARY="3b82f6"
BRAND_COLOR_ACCENT="f59e0b"
BRAND_COLOR_BACKGROUND="0f172a"

# Dark mode colors (optional)
BRAND_COLOR_DARK_PRIMARY="10b981"
BRAND_COLOR_DARK_SECONDARY="3b82f6"
BRAND_COLOR_DARK_ACCENT="f59e0b"
BRAND_COLOR_DARK_BACKGROUND="0f172a"

# Social links
BRAND_TWITTER="@yourbrand"
BRAND_GITHUB="yourorg/yourrepo"
BRAND_SUPPORT_EMAIL="support@yourdomain.com"
```

## Design Tips

### Logo

- Keep it simple — works at small sizes
- Test on both light and dark backgrounds
- SVG preferred for scalability

### Colors

- Primary: Used for CTAs, links, highlights
- Secondary: Used for borders, secondary elements
- Accent: Used for warnings, badges
- Background: Main page background

### OG Image

- Include brand name prominently
- Use high contrast for text
- Test preview on Twitter/Facebook/LinkedIn

## Verification

After setup, verify:

1. [ ] Logo appears in header
2. [ ] Favicon shows in browser tab
3. [ ] Brand name in page titles
4. [ ] OG image generates correctly
5. [ ] Colors apply throughout UI
6. [ ] "Powered by Tank" visible in footer
