import type { QueryClient } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { createRootRouteWithContext, HeadContent, Outlet, Scripts } from '@tanstack/react-router';
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools';

import { NotFoundScreen } from '~/screens/not-found-screen';

import '~/styles/global.css';

export const Route = createRootRouteWithContext<{
  queryClient: QueryClient;
}>()({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { content: 'width=device-width, initial-scale=1', name: 'viewport' },
      { title: 'Tank' },
      { content: 'Security-first package manager for AI agent skills.', name: 'description' },
      {
        name: 'keywords',
        content:
          'Tank, AI skills, AI agent skills, package manager, security, Claude Code, Cursor, AI agents, skill registry, developer tools, CLI, security scanning'
      },
      { name: 'author', content: 'Tank' },
      { name: 'creator', content: 'Tank' },
      { name: 'publisher', content: 'Tank' },
      { name: 'robots', content: 'index, follow, max-image-preview:large, max-snippet:-1' },
      { name: 'twitter:card', content: 'summary_large_image' },
      { property: 'og:site_name', content: 'Tank' },
      { property: 'og:type', content: 'website' },
      { property: 'og:image', content: 'https://www.tankpkg.dev/og.png' }
    ],
    links: [
      { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
      { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/favicon-32.png' },
      { rel: 'apple-touch-icon', sizes: '180x180', href: '/apple-touch-icon.png' },
      { rel: 'manifest', href: '/manifest.json' },
    ],
    scripts: [
      {
        type: 'application/ld+json',
        children: JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'Organization',
          name: 'Tank',
          url: 'https://www.tankpkg.dev',
          logo: 'https://www.tankpkg.dev/logo512.png',
          sameAs: ['https://github.com/tankpkg/tank'],
          description: 'Security-first package manager for AI agent skills'
        })
      },
      {
        type: 'application/ld+json',
        children: JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'WebSite',
          name: 'Tank',
          url: 'https://www.tankpkg.dev',
          potentialAction: {
            '@type': 'SearchAction',
            target: 'https://www.tankpkg.dev/skills?q={search_term_string}',
            'query-input': 'required name=search_term_string'
          }
        })
      }
    ]
  }),
  component: RootLayout,
  shellComponent: RootDocument,
  notFoundComponent: NotFoundScreen
});

function RootLayout() {
  return <Outlet />;
}

const themeScript = `(function(){try{var d=document.documentElement;var p=window.matchMedia('(prefers-color-scheme:light)').matches;if(p)d.classList.remove('dark');else d.classList.add('dark')}catch(e){}})()`;

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark scroll-smooth" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <HeadContent />
      </head>
      <body>
        {children}
        <ReactQueryDevtools buttonPosition="bottom-left" />
        <TanStackRouterDevtools position="bottom-right" />
        <Scripts />
      </body>
    </html>
  );
}
