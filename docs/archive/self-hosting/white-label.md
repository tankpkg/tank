# White-Label Setup Guide

This guide explains how to customize the Tank's branding for your self-hosted deployment.

## Overview

Tank supports full white-label customization, allowing you to:

- Replace the product name throughout the UI
- Use your own logo and favicon
- Customize brand colors (including dark mode)
- Set your own social links
- Maintain "Powered by Tank" attribution (required)

## Quick Start

### 1. Set Environment Variables

Create or update your `.env.local` file:

```bash
# Required: Your brand name
BRAND_NAME="Acme Skills"

# Recommended: Visual assets (place in public/brand/ directory)
BRAND_LOGO_URL="/brand/logo.png"
BRAND_LOGO_TIGHT_URL="/brand/logo-tight.png"
BRAND_FAVICON_URL="/brand/favicon.ico"
BRAND_OG_IMAGE_URL="/brand/og-default.png"

# Optional: Colors (hex without #)
BRAND_COLOR_PRIMARY="3b82f6"     # Blue
BRAND_COLOR_SECONDARY="8b5cf6"   # Purple
BRAND_COLOR_ACCENT="f59e0b"      # Amber
BRAND_COLOR_BACKGROUND="0f172a"  # Slate 900

# Optional: Dark mode colors (defaults to light mode colors)
BRAND_COLOR_DARK_PRIMARY="3b82f6"
BRAND_COLOR_DARK_SECONDARY="8b5cf6"
BRAND_COLOR_DARK_ACCENT="f59e0b"
BRAND_COLOR_DARK_BACKGROUND="0f172a"

# Optional: Social links
BRAND_TWITTER="@acme"
BRAND_GITHUB="acme/skills-registry"
BRAND_SUPPORT_EMAIL="support@acme.com"
```

### 2. Add Brand Assets

Create a `public/brand/` directory and add your assets:

```
apps/registry/public/brand/
├── logo.png          # 120×40px recommended
├── logo-tight.png    # 32×32px icon-only
├── favicon.ico       # 32×32px
└── og-default.png    # 1200×630px for social sharing
```

### 3. Restart the Server

```bash
pnpm dev
```

## Asset Requirements

| Asset      | Recommended Size | Format  | Notes                  |
| ---------- | ---------------- | ------- | ---------------------- |
| Logo       | 120×40px         | PNG/SVG | Transparent background |
| Logo tight | 32×32px          | PNG/SVG | Icon-only version      |
| Favicon    | 32×32px          | ICO/PNG | Browser tab icon       |
| OG image   | 1200×630px       | PNG     | Social media preview   |

## Color Guidelines

- **Contrast**: Ensure 4.5:1 ratio for text on background
- **Primary**: Used for buttons, links, highlights
- **Secondary**: Used for secondary actions, borders
- **Accent**: Used for warnings, highlights
- **Background**: Main background color

### Testing Colors

Use tools like:

- [WebAIM Contrast Checker](https://webaim.org/resources/contrastchecker/)
- [Coolors](https://coolors.co/) for palette generation

## What Gets Customized

### ✅ Customized

- Product name in header, footer, titles
- Logo in navigation and authentication pages
- Favicon and PWA manifest icons
- OpenGraph images for social sharing
- Primary, secondary, accent colors
- Social media links
- Meta descriptions and titles

### ❌ Not Customized (Tank Branding)

- CLI output and help text
- MCP server messages
- Package names (`@tankpkg/*`)
- "Powered by Tank" footer link (required)

## Required Attribution

The "Powered by Tank" footer link is **mandatory** and cannot be disabled. This provides attribution to the open-source project.

## Example: Complete Setup

```bash
# .env.local for "Acme Skills"
BRAND_NAME="Acme Skills"
BRAND_TAGLINE="Enterprise AI Skills Registry"
BRAND_URL="https://skills.acme.com"
BRAND_LOGO_URL="/brand/logo.png"
BRAND_LOGO_TIGHT_URL="/brand/logo-tight.png"
BRAND_FAVICON_URL="/brand/favicon.ico"
BRAND_OG_IMAGE_URL="/brand/og-default.png"
BRAND_COLOR_PRIMARY="3b82f6"
BRAND_COLOR_SECONDARY="8b5cf6"
BRAND_COLOR_ACCENT="f59e0b"
BRAND_COLOR_BACKGROUND="ffffff"
BRAND_TWITTER="@acme"
BRAND_GITHUB="acme/skills-registry"
BRAND_SUPPORT_EMAIL="support@acme.com"
```

## Troubleshooting

### Colors not updating

- Clear browser cache
- Restart development server
- Verify hex format (6 characters, no `#` prefix)

### Logo not showing

- Check file path starts with `/brand/`
- Verify file exists in `apps/registry/public/brand/`
- Check image dimensions

### Dark mode colors not applying

- Set `BRAND_COLOR_DARK_*` variables
- Defaults to light mode colors if not set

## See Also

- [Self-Hosting Overview](./README.md)
- [Brand Assets Checklist](./assets.md)
