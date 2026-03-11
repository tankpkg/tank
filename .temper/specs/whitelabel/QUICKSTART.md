# White-Label Quickstart

## For Developers (Implementation)

### 1. Create shared types
```typescript
// packages/shared/src/brand.ts
export interface BrandConfig {
  name: string;
  tagline: string;
  url: string;
  logo: { default: string; tight: string };
  favicon: string;
  ogImage: string;
  colors: {
    primary: string;    // hex without #
    secondary: string;
    accent: string;
    background: string;
  };
  social: {
    twitter?: string;
    github?: string;
    email?: string;
  };
}

export const DEFAULT_BRAND: BrandConfig = {
  name: 'Tank',
  tagline: 'Security-first package manager for AI agent skills',
  url: 'https://tankpkg.dev',
  logo: { default: '/logo.png', tight: '/logo-tight.png' },
  favicon: '/favicon.ico',
  ogImage: '/og-default.png',
  colors: {
    primary: '10b981',
    secondary: '3b82f6',
    accent: 'f59e0b',
    background: '0f172a',
  },
  social: {
    twitter: '@tankpkg',
    github: 'tankpkg/tank',
  },
};
```

### 2. Create config accessor
```typescript
// apps/web/lib/branding.ts
import { BrandConfig, DEFAULT_BRAND } from '@tank/shared';

export function getBrandConfig(): BrandConfig {
  return {
    name: process.env.BRAND_NAME || DEFAULT_BRAND.name,
    tagline: process.env.BRAND_TAGLINE || DEFAULT_BRAND.tagline,
    url: process.env.BRAND_URL || DEFAULT_BRAND.url,
    logo: {
      default: process.env.BRAND_LOGO_URL || DEFAULT_BRAND.logo.default,
      tight: process.env.BRAND_LOGO_TIGHT_URL || DEFAULT_BRAND.logo.tight,
    },
    favicon: process.env.BRAND_FAVICON_URL || DEFAULT_BRAND.favicon,
    ogImage: process.env.BRAND_OG_IMAGE_URL || DEFAULT_BRAND.ogImage,
    colors: {
      primary: process.env.BRAND_COLOR_PRIMARY || DEFAULT_BRAND.colors.primary,
      secondary: process.env.BRAND_COLOR_SECONDARY || DEFAULT_BRAND.colors.secondary,
      accent: process.env.BRAND_COLOR_ACCENT || DEFAULT_BRAND.colors.accent,
      background: process.env.BRAND_COLOR_BACKGROUND || DEFAULT_BRAND.colors.background,
    },
    social: {
      twitter: process.env.BRAND_TWITTER || DEFAULT_BRAND.social.twitter,
      github: process.env.BRAND_GITHUB || DEFAULT_BRAND.social.github,
      email: process.env.BRAND_SUPPORT_EMAIL,
    },
  };
}
```

### 3. Add CSS variables
```css
/* apps/web/app/globals.css */
:root {
  --brand-primary: var(--color-emerald-400);
  --brand-secondary: var(--color-blue-500);
  --brand-accent: var(--color-amber-500);
  --brand-background: var(--color-slate-900);
}
```

### 4. Update components
```tsx
// apps/web/components/logo.tsx
import { getBrandConfig } from '@/lib/branding';
import Image from 'next/image';

export function Logo({ tight = false }: { tight?: boolean }) {
  const brand = getBrandConfig();
  const src = tight ? brand.logo.tight : brand.logo.default;

  return (
    <Image
      src={src}
      alt={`${brand.name} logo`}
      width={tight ? 32 : 120}
      height={tight ? 32 : 40}
    />
  );
}
```

### 5. Powered by footer
```tsx
// apps/web/components/footer.tsx
export function Footer() {
  const brand = getBrandConfig();

  return (
    <footer>
      {/* ... other footer content ... */}
      <div className="powered-by">
        Powered by{' '}
        <a href="https://tankpkg.dev" target="_blank" rel="noopener">
          Tank
        </a>
      </div>
    </footer>
  );
}
```

---

## For Self-Hosters (Usage)

### Environment Configuration

Create `.env.local` with your brand settings:

```bash
# Required: Your brand name
BRAND_NAME="Acme Skills"

# Recommended: Visual assets
BRAND_LOGO_URL="/brand/logo.png"
BRAND_FAVICON_URL="/brand/favicon.ico"

# Optional: Colors (hex without #)
BRAND_COLOR_PRIMARY="3b82f6"  # Blue instead of green
```

### Asset Requirements

| Asset | Size | Format | Notes |
|-------|------|--------|-------|
| Logo | 120×40px | PNG/SVG | Transparent background |
| Logo tight | 32×32px | PNG/SVG | Icon-only version |
| Favicon | 32×32px | ICO/PNG | Browser tab icon |
| OG image | 1200×630px | PNG | Social media preview |

Place assets in `apps/web/public/brand/` directory.

### Brand Guidelines

- **Contrast:** Ensure 4.5:1 ratio for text on background
- **Logo:** Use transparent PNG or SVG for flexibility
- **Colors:** Test in both light and dark contexts
- **Name:** Keep under 20 characters for UI fit

---

## Testing Your Brand

```bash
# 1. Set environment variables
export BRAND_NAME="Test Brand"
export BRAND_COLOR_PRIMARY="ff0000"

# 2. Start dev server
pnpm dev

# 3. Check
# - Logo appears
# - Name shows in header
# - Colors applied
# - "Powered by Tank" visible
# - OG image generates correctly
```
