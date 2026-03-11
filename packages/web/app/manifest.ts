import type { MetadataRoute } from 'next';
import { getBrandConfig } from '@/lib/branding';

export const dynamic = 'force-dynamic';

export default function manifest(): MetadataRoute.Manifest {
  const brand = getBrandConfig();

  return {
    name: brand.name,
    short_name: brand.name,
    description: brand.tagline,
    start_url: '/',
    display: 'standalone',
    background_color: `#${brand.colors.background}`,
    theme_color: `#${brand.colors.primary}`,
    icons: [
      {
        src: brand.logo.default,
        sizes: 'any',
        type: 'image/png'
      },
      {
        src: brand.logo.tight,
        sizes: 'any',
        type: 'image/png'
      },
      {
        src: '/favicon-16x16.png',
        sizes: '16x16',
        type: 'image/png'
      },
      {
        src: '/favicon-32x32.png',
        sizes: '32x32',
        type: 'image/png'
      },
      {
        src: '/favicon.ico',
        type: 'image/x-icon'
      }
    ],
    categories: ['developer tools', 'package manager', 'security'],
    orientation: 'portrait-primary'
  };
}
