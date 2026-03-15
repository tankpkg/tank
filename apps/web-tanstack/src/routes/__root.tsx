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
      { content: 'Security-first package manager for AI agent skills.', name: 'description' }
    ],
    links: []
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
