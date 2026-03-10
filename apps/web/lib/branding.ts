/**
 * Brand configuration accessor for the web app
 * Reads environment variables and provides typed brand config
 */

import type { BrandConfig, BrandEnvVars } from '@tank/shared';
import { DEFAULT_BRAND, isValidHexColor } from '@tank/shared';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace NodeJS {
    interface ProcessEnv extends BrandEnvVars {}
  }
}

/**
 * Validates and sanitizes a hex color from env var
 * Returns the color if valid, undefined otherwise
 */
function parseHexColor(value: string | undefined): string | undefined {
  if (!value) return undefined;
  // Remove # prefix if present
  const clean = value.startsWith('#') ? value.slice(1) : value;
  return isValidHexColor(clean) ? clean : undefined;
}

/**
 * Get the current brand configuration
 * Merges environment variables with defaults
 *
 * This function is safe to call at module scope or runtime.
 * Values are cached after first access for performance.
 */
let _cachedBrand: BrandConfig | null = null;

export function getBrandConfig(): BrandConfig {
  if (_cachedBrand) return _cachedBrand;

  const env = process.env;

  const config: BrandConfig = {
    name: env.BRAND_NAME || DEFAULT_BRAND.name,
    tagline: env.BRAND_TAGLINE || DEFAULT_BRAND.tagline,
    url: env.BRAND_URL || DEFAULT_BRAND.url,
    logo: {
      default: env.BRAND_LOGO_URL || DEFAULT_BRAND.logo.default,
      tight: env.BRAND_LOGO_TIGHT_URL || DEFAULT_BRAND.logo.tight,
    },
    favicon: env.BRAND_FAVICON_URL || DEFAULT_BRAND.favicon,
    ogImage: env.BRAND_OG_IMAGE_URL || DEFAULT_BRAND.ogImage,
    colors: {
      primary: parseHexColor(env.BRAND_COLOR_PRIMARY) || DEFAULT_BRAND.colors.primary,
      secondary: parseHexColor(env.BRAND_COLOR_SECONDARY) || DEFAULT_BRAND.colors.secondary,
      accent: parseHexColor(env.BRAND_COLOR_ACCENT) || DEFAULT_BRAND.colors.accent,
      background: parseHexColor(env.BRAND_COLOR_BACKGROUND) || DEFAULT_BRAND.colors.background,
    },
    darkColors: {
      primary: parseHexColor(env.BRAND_COLOR_DARK_PRIMARY) || parseHexColor(env.BRAND_COLOR_PRIMARY) || DEFAULT_BRAND.darkColors!.primary,
      secondary: parseHexColor(env.BRAND_COLOR_DARK_SECONDARY) || parseHexColor(env.BRAND_COLOR_SECONDARY) || DEFAULT_BRAND.darkColors!.secondary,
      accent: parseHexColor(env.BRAND_COLOR_DARK_ACCENT) || parseHexColor(env.BRAND_COLOR_ACCENT) || DEFAULT_BRAND.darkColors!.accent,
      background: parseHexColor(env.BRAND_COLOR_DARK_BACKGROUND) || parseHexColor(env.BRAND_COLOR_BACKGROUND) || DEFAULT_BRAND.darkColors!.background,
    },
    social: {
      twitter: env.BRAND_TWITTER || DEFAULT_BRAND.social.twitter,
      github: env.BRAND_GITHUB || DEFAULT_BRAND.social.github,
      email: env.BRAND_SUPPORT_EMAIL || DEFAULT_BRAND.social.email,
    },
  };

  // Only cache in production to allow dev-time changes
  if (process.env.NODE_ENV === 'production') {
    _cachedBrand = config;
  }

  return config;
}

/**
 * Reset brand cache (useful for testing)
 */
export function resetBrandCache(): void {
  _cachedBrand = null;
}

/**
 * Get CSS custom properties for brand colors
 * Returns a style object suitable for inline styles
 */
export function getBrandCssVars(darkMode = false): Record<string, string> {
  const brand = getBrandConfig();
  const colors = darkMode && brand.darkColors ? brand.darkColors : brand.colors;

  return {
    '--brand-primary': `#${colors.primary}`,
    '--brand-secondary': `#${colors.secondary}`,
    '--brand-accent': `#${colors.accent}`,
    '--brand-background': `#${colors.background}`,
  };
}

/**
 * Check if using default Tank branding
 */
export function isDefaultBrand(): boolean {
  const brand = getBrandConfig();
  return brand.name === DEFAULT_BRAND.name && brand.url === DEFAULT_BRAND.url;
}
