import { useQuery } from '@tanstack/react-query';
import { Link, Outlet } from '@tanstack/react-router';

import { CommandMenu } from '~/components/command-menu';
import { HomeNavAuthCta } from '~/components/home-auth-cta';
import { Navbar } from '~/components/navbar';
import { SearchTrigger } from '~/components/search-trigger';
import { githubStarsQueryOptions } from '~/query/github';

export function RegistryLayout() {
  const { data: starCount } = useQuery(githubStarsQueryOptions);

  return (
    <div className="min-h-screen bg-background tank-gradient-bg tank-grid-overlay">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:z-[100] focus:top-4 focus:left-4 focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-md">
        Skip to content
      </a>

      {/* Decorative orbs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="tank-orb tank-orb-green w-[600px] h-[600px] -top-48 -left-48 opacity-30" />
        <div className="tank-orb tank-orb-green w-[500px] h-[500px] top-1/3 -right-32 opacity-20" />
        <div className="tank-orb tank-orb-green w-[400px] h-[400px] bottom-0 left-1/4 opacity-25" />
      </div>

      <header className="sticky top-0 z-50 border-b border-emerald-500/10 bg-background/80 backdrop-blur-xl shadow-sm dark:shadow-none">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="relative flex h-16 items-center justify-between">
            <div className="flex items-center gap-1.5 shrink-0">
              <Link
                to="/"
                className="flex items-center gap-2.5 font-bold text-lg tracking-tight hover:opacity-80 transition-all group">
                <img src="/logo.png" alt="Tank" width={28} height={28} className="rounded-sm" />
                <span>Tank</span>
              </Link>
              <Navbar />
            </div>
            <div className="absolute left-1/2 -translate-x-1/2 w-full max-w-md pointer-events-auto max-lg:hidden">
              <SearchTrigger />
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <a
                href="https://github.com/tankpkg/tank"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-lg border border-border/60 bg-background/60 px-3 py-1.5 text-sm font-medium text-foreground shadow-sm hover:bg-muted/80 hover:shadow-md dark:border-emerald-500/20 dark:bg-emerald-500/5 dark:shadow-none dark:hover:bg-emerald-500/10 dark:hover:border-emerald-500/40 transition-all"
                aria-label="Star Tank on GitHub">
                <svg
                  className="h-4 w-4 text-muted-foreground"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true">
                  <title>GitHub</title>
                  <path
                    fillRule="evenodd"
                    d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
                    clipRule="evenodd"
                  />
                </svg>
                <span className="hidden sm:inline">Star</span>
                {starCount != null && (
                  <span className="font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">{starCount}</span>
                )}
              </a>
              <HomeNavAuthCta />
            </div>
          </div>
        </div>
      </header>

      <main id="main-content" className="relative">
        <Outlet />
      </main>

      <footer className="border-t border-emerald-500/10 bg-background/50 backdrop-blur-sm">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex flex-col sm:flex-row items-center gap-4 text-sm text-muted-foreground">
              <Link
                to="/"
                className="flex items-center gap-2 font-semibold text-foreground hover:opacity-80 transition-opacity">
                <img src="/logo.png" alt="Tank" width={20} height={20} className="rounded-sm" />
                <span>Tank</span>
              </Link>
              <span className="hidden sm:inline text-muted-foreground/30">&bull;</span>
              <span className="sm:hidden text-muted-foreground/30">&mdash;</span>
              <span>Security-first package manager for AI agent skills</span>
            </div>
            <div className="flex items-center gap-6 text-sm text-muted-foreground">
              <Link to="/skills" search={{} as never} className="hover:text-emerald-400 transition-colors">
                Skills
              </Link>
              <Link to="/docs" className="hover:text-emerald-400 transition-colors">
                Docs
              </Link>
              <a
                href="https://github.com/tankpkg/tank"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 hover:text-foreground transition-colors">
                <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fillRule="evenodd"
                    d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
                    clipRule="evenodd"
                  />
                </svg>
                GitHub
              </a>
            </div>
          </div>
        </div>
      </footer>

      <CommandMenu />
    </div>
  );
}
