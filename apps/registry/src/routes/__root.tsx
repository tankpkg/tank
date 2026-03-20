import type { QueryClient } from '@tanstack/react-query';
import { createRootRouteWithContext, HeadContent, Scripts, useLocation } from '@tanstack/react-router';
import { lazy, useEffect, useRef } from 'react';

const ReactQueryDevtools = import.meta.env.DEV
  ? lazy(() => import('@tanstack/react-query-devtools').then((m) => ({ default: m.ReactQueryDevtools })))
  : () => null;

const TanStackRouterDevtools = import.meta.env.DEV
  ? lazy(() => import('@tanstack/react-router-devtools').then((m) => ({ default: m.TanStackRouterDevtools })))
  : () => null;

import { CookieConsentManager } from '~/components/cookie-consent-manager';
import { RegistryLayout } from '~/components/layouts/registry-layout';
import { BASE_URL, routeHead, SITE_NAME } from '~/consts/seo';
import { useDevTools } from '~/hooks/use-dev-tools';
import { capturePageview } from '~/lib/analytics';
import { NotFoundScreen } from '~/screens/not-found-screen';

import '~/styles/global.css';

const headSettings = {
  ...routeHead({
    title: SITE_NAME,
    description: 'Security-first package manager for AI agent skills.',
    path: '/'
  }),
  meta: [
    { charSet: 'utf-8' },
    { content: 'width=device-width, initial-scale=1', name: 'viewport' },
    { title: SITE_NAME },
    { content: 'Security-first package manager for AI agent skills.', name: 'description' },
    {
      name: 'keywords',
      content:
        'Tank, AI skills, AI agent skills, package manager, security, Claude Code, Cursor, AI agents, skill registry, developer tools, CLI, security scanning'
    },
    { name: 'author', content: SITE_NAME },
    { name: 'creator', content: SITE_NAME },
    { name: 'publisher', content: SITE_NAME },
    { name: 'robots', content: 'index, follow, max-image-preview:large, max-snippet:-1' },
    { name: 'twitter:card', content: 'summary_large_image' },
    { property: 'og:site_name', content: SITE_NAME },
    { property: 'og:type', content: 'website' },
    { property: 'og:image', content: `${BASE_URL}/api/og` }
  ],
  links: [
    { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
    { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/favicon-32.png' },
    { rel: 'apple-touch-icon', sizes: '180x180', href: '/apple-touch-icon.png' },
    { rel: 'manifest', href: '/manifest.json' }
  ],
  scripts: [
    {
      children: `(function(){try{var t=localStorage.getItem('tank-theme');if(t==='light')document.documentElement.classList.remove('dark')}catch(e){}})()`
    },
    {
      type: 'application/ld+json',
      children: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'Organization',
        name: SITE_NAME,
        url: BASE_URL,
        logo: `${BASE_URL}/logo512.png`,
        sameAs: ['https://github.com/tankpkg/tank'],
        description: 'Security-first package manager for AI agent skills'
      })
    },
    {
      type: 'application/ld+json',
      children: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        name: SITE_NAME,
        url: BASE_URL,
        potentialAction: {
          '@type': 'SearchAction',
          target: `${BASE_URL}/skills?q={search_term_string}`,
          'query-input': 'required name=search_term_string'
        }
      })
    }
  ]
};

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => headSettings,
  component: RootLayout,
  shellComponent: RootDocument,
  notFoundComponent: NotFoundScreen
});

function RootLayout() {
  const { pathname } = useLocation();
  const prev = useRef('');

  useEffect(() => {
    if (pathname !== prev.current) {
      prev.current = pathname;
      capturePageview();
    }
  }, [pathname]);

  return <RegistryLayout />;
}

function RootDocument({ children }: { children: React.ReactNode }) {
  const devToolsVisible = useDevTools();

  return (
    <html lang="en" className="dark scroll-smooth" suppressHydrationWarning>
      <head>
        {import.meta.env.DEV && (
          <script src="https://unpkg.com/react-scan/dist/auto.global.js" crossOrigin="anonymous" />
        )}
        <HeadContent />
      </head>
      <body>
        {children}
        <CookieConsentManager />
        {devToolsVisible && (
          <>
            <ReactQueryDevtools buttonPosition="bottom-left" />
            <TanStackRouterDevtools position="bottom-right" />
          </>
        )}
        <Scripts />
      </body>
    </html>
  );
}
