export interface BrandColors {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
}

export interface BrandLogo {
  default: string;
  tight: string;
}

export interface BrandSocial {
  twitter?: string;
  github?: string;
  email?: string;
}

export interface BrandConfig {
  name: string;
  tagline: string;
  url: string;
  logo: BrandLogo;
  favicon: string;
  ogImage: string;
  colors: BrandColors;
  social: BrandSocial;
  darkColors?: BrandColors;
}

export const DEFAULT_BRAND: BrandConfig = {
  name: 'Tank',
  tagline: 'Security-first package manager for AI agent skills',
  url: 'https://tankpkg.dev',
  logo: {
    default: '/logo.png',
    tight: '/logo-tight.png'
  },
  favicon: '/favicon.ico',
  ogImage: '/og-default.png',
  colors: {
    primary: '10b981',
    secondary: '3b82f6',
    accent: 'f59e0b',
    background: '0f172a'
  },
  darkColors: {
    primary: '10b981',
    secondary: '3b82f6',
    accent: 'f59e0b',
    background: '0f172a'
  },
  social: {
    twitter: '@tankpkg',
    github: 'tankpkg/tank'
  }
};

const HEX_COLOR_REGEX = /^[0-9a-fA-F]{6}$/;

export function isValidHexColor(color: string): boolean {
  return HEX_COLOR_REGEX.test(color);
}

export function hexToOklch(hex: string): string {
  return `#${hex}`;
}

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
