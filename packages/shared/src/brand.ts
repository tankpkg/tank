/**
 * White-label brand configuration types
 * Enables self-hosted deployments to customize branding
 */

export interface BrandColors {
  /** Primary brand color (hex without #) */
  primary: string;
  /** Secondary brand color (hex without #) */
  secondary: string;
  /** Accent/highlight color (hex without #) */
  accent: string;
  /** Background color (hex without #) */
  background: string;
}

export interface BrandLogo {
  /** Default logo URL or path */
  default: string;
  /** Compact/icon logo URL or path */
  tight: string;
}

export interface BrandSocial {
  /** Twitter handle (e.g., "@tankpkg") */
  twitter?: string;
  /** GitHub org/repo (e.g., "tankpkg/tank") */
  github?: string;
  /** Support email address */
  email?: string;
}

export interface BrandConfig {
  /** Product name displayed in UI */
  name: string;
  /** Tagline for meta descriptions */
  tagline: string;
  /** Public URL of the deployment */
  url: string;
  /** Logo assets */
  logo: BrandLogo;
  /** Favicon URL or path */
  favicon: string;
  /** Default OpenGraph image URL or path */
  ogImage: string;
  /** Brand colors */
  colors: BrandColors;
  /** Social media links */
  social: BrandSocial;
  /** Dark mode color overrides */
  darkColors?: BrandColors;
}

/**
 * Default Tank brand configuration
 * Used when no custom brand is configured
 */
export const DEFAULT_BRAND: BrandConfig = {
  name: 'Tank',
  tagline: 'Security-first package manager for AI agent skills',
  url: 'https://tankpkg.dev',
  logo: {
    default: '/logo.png',
    tight: '/logo-tight.png',
  },
  favicon: '/favicon.ico',
  ogImage: '/og-default.png',
  colors: {
    primary: '10b981', // emerald-400
    secondary: '3b82f6', // blue-500
    accent: 'f59e0b', // amber-500
    background: '0f172a', // slate-900
  },
  darkColors: {
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

/**
 * Hex color validation regex
 */
const HEX_COLOR_REGEX = /^[0-9a-fA-F]{6}$/;

/**
 * Validates a hex color string (without # prefix)
 */
export function isValidHexColor(color: string): boolean {
  return HEX_COLOR_REGEX.test(color);
}

/**
 * Converts hex color to oklch format for CSS
 * Uses a simplified conversion that maintains hue
 */
export function hexToOklch(hex: string): string {
  // For now, return the hex with # prefix as fallback
  // Full oklch conversion would require color math library
  return `#${hex}`;
}

/**
 * Brand configuration environment variable mapping
 */
export interface BrandEnvVars {
  BRAND_NAME?: string;
  BRAND_TAGLINE?: string;
  BRAND_URL?: string;
  BRAND_LOGO_URL?: string;
  BRAND_LOGO_TIGHT_URL?: string;
  BRAND_FAVICON_URL?: string;
  BRAND_OG_IMAGE_URL?: string;
  BRAND_COLOR_PRIMARY?: string;
  BRAND_COLOR_SECONDARY?: string;
  BRAND_COLOR_ACCENT?: string;
  BRAND_COLOR_BACKGROUND?: string;
  BRAND_COLOR_DARK_PRIMARY?: string;
  BRAND_COLOR_DARK_SECONDARY?: string;
  BRAND_COLOR_DARK_ACCENT?: string;
  BRAND_COLOR_DARK_BACKGROUND?: string;
  BRAND_TWITTER?: string;
  BRAND_GITHUB?: string;
  BRAND_SUPPORT_EMAIL?: string;
}
