import mdx from '@astrojs/mdx';
import node from '@astrojs/node';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, fontProviders, memoryCache } from 'astro/config';

export default defineConfig({
  adapter: node({ mode: 'standalone' }),

  integrations: [
    react({
      babel: {
        plugins: ['babel-plugin-react-compiler']
      }
    }),
    mdx()
  ],

  fonts: [
    {
      provider: fontProviders.fontsource(),
      name: 'Inter',
      cssVariable: '--font-inter'
    }
  ],

  security: {
    csp: {
      algorithm: 'SHA-256',
      directives: [
        "default-src 'self'",
        "connect-src 'self' https://*.posthog.com https://*.i.posthog.com https://*.google-analytics.com",
        "img-src 'self' data:",
        "font-src 'self'",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "frame-ancestors 'none'"
      ],
      scriptDirective: {
        resources: ["'self'", 'https://www.googletagmanager.com'],
        strictDynamic: true
      }
    }
  },

  experimental: {
    cache: {
      provider: memoryCache({ max: 500 })
    },
    routeRules: {
      '/': { maxAge: 120, swr: 60, tags: ['homepage'] },
      '/api/health': { maxAge: 30 },
      '/skills': { maxAge: 60, swr: 30, tags: ['skills'] },
      '/skills/*': { maxAge: 60, swr: 30, tags: ['skills'] }
    },
    queuedRendering: { enabled: true }
  },

  vite: {
    plugins: tailwindcss()
  },

  server: {
    port: 4321,
    host: true
  }
});
