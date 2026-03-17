import { useQuery } from '@tanstack/react-query';
import { Link, Outlet } from '@tanstack/react-router';

import { CommandMenu } from '~/components/command-menu';
import { CookiePreferencesButton } from '~/components/cookie-preferences-button';
import { HomeNavAuthCta } from '~/components/home-auth-cta';
import { Navbar } from '~/components/navbar';
import { SearchTrigger } from '~/components/search-trigger';
import { ThemeToggle } from '~/components/theme-toggle';
import { GITHUB_ICON_PATH } from '~/consts/brand';
import { githubStarsQueryOptions } from '~/query/github';

export function RegistryLayout() {
  const { data: starCount } = useQuery(githubStarsQueryOptions);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Matrix grid background */}
      <div className="matrix-grid" aria-hidden="true" />

      {/* Matrix rain — decorative data stream */}
      <div className="matrix-rain" aria-hidden="true">
        <div className="matrix-rain-col" style={{ left: '5%', animationDuration: '18s', animationDelay: '-2s' }}>
          SHA-512 VERIFY INTEGRITY CHECK PASS
        </div>
        <div className="matrix-rain-col" style={{ left: '15%', animationDuration: '22s', animationDelay: '-8s' }}>
          SCAN STAGE-1 INGEST STAGE-2 VALIDATE
        </div>
        <div className="matrix-rain-col" style={{ left: '30%', animationDuration: '25s', animationDelay: '-4s' }}>
          PERMIT NETWORK DENY SUBPROCESS SECURE
        </div>
        <div className="matrix-rain-col" style={{ left: '50%', animationDuration: '20s', animationDelay: '-12s' }}>
          AUDIT SCORE 9.2 VERDICT PASS VERIFIED
        </div>
        <div className="matrix-rain-col" style={{ left: '70%', animationDuration: '24s', animationDelay: '-6s' }}>
          LOCKFILE HASH MATCH TRUE INTEGRITY OK
        </div>
        <div className="matrix-rain-col" style={{ left: '85%', animationDuration: '19s', animationDelay: '-15s' }}>
          PERMISSION BUDGET filesystem.read ALLOW
        </div>
        <div className="matrix-rain-col" style={{ left: '95%', animationDuration: '23s', animationDelay: '-9s' }}>
          PIPELINE STAGE-6 COMPLETE PUBLISH OK
        </div>
      </div>

      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:z-[100] focus:top-4 focus:left-4 focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-md">
        Skip to content
      </a>

      <header className="sticky top-0 z-50 border-b border-border bg-background/85 backdrop-blur-xl">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <div className="relative flex h-14 items-center justify-between">
            <div className="flex items-center gap-1.5 shrink-0">
              <Link
                to="/"
                className="flex items-center gap-2.5 font-extrabold text-[17px] tracking-tight hover:opacity-80 transition-opacity">
                <svg width="26" height="26" viewBox="0 0 56 56" fill="none" aria-hidden="true">
                  <path
                    d="M28 4L8 14v14c0 12.6 8.5 24.3 20 28 11.5-3.7 20-15.4 20-28V14L28 4z"
                    fill="none"
                    stroke="var(--tank-green-ui)"
                    strokeWidth="2.5"
                  />
                  <path
                    d="M28 4L8 14v14c0 12.6 8.5 24.3 20 28 11.5-3.7 20-15.4 20-28V14L28 4z"
                    fill="rgba(0,255,65,0.04)"
                  />
                  <text
                    x="28"
                    y="37"
                    textAnchor="middle"
                    fontFamily="system-ui"
                    fontSize="21"
                    fontWeight="800"
                    fill="currentColor">
                    T
                  </text>
                </svg>
                <span>Tank</span>
              </Link>
              <Navbar />
            </div>
            <div className="absolute left-1/2 -translate-x-1/2 w-full max-w-md pointer-events-auto max-lg:hidden">
              <SearchTrigger />
            </div>
            <div className="flex items-center gap-4 shrink-0">
              <a
                href="https://github.com/tankpkg/tank"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Star Tank on GitHub">
                <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <title>GitHub</title>
                  <path fillRule="evenodd" d={GITHUB_ICON_PATH} clipRule="evenodd" />
                </svg>
                {starCount != null && <span className="font-semibold tabular-nums text-tank">{starCount}</span>}
              </a>
              <div className="h-4 w-px bg-border" aria-hidden="true" />
              <ThemeToggle />
              <div className="h-4 w-px bg-border" aria-hidden="true" />
              <HomeNavAuthCta />
            </div>
          </div>
        </div>
      </header>

      <main id="main-content" className="relative z-[1] flex-1">
        <Outlet />
      </main>

      <footer className="relative z-[1] border-t border-border">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <Link
                to="/"
                className="flex items-center gap-2 font-semibold text-foreground/40 hover:text-foreground/60 transition-opacity">
                <svg width="18" height="18" viewBox="0 0 56 56" fill="none" aria-hidden="true">
                  <path
                    d="M28 4L8 14v14c0 12.6 8.5 24.3 20 28 11.5-3.7 20-15.4 20-28V14L28 4z"
                    fill="none"
                    stroke="var(--tank-green-ui)"
                    strokeWidth="2.5"
                  />
                  <text
                    x="28"
                    y="37"
                    textAnchor="middle"
                    fontFamily="system-ui"
                    fontSize="21"
                    fontWeight="800"
                    fill="currentColor">
                    T
                  </text>
                </svg>
                <span className="text-[13px]">Tank</span>
              </Link>
              <span className="text-muted-foreground/20 hidden sm:inline">&bull;</span>
              <span className="text-xs text-muted-foreground/50">
                Security-first package manager for AI agent skills
              </span>
            </div>
            <div className="flex items-center gap-5 text-sm text-muted-foreground/60">
              <Link to="/skills" search={{} as never} className="hover:text-foreground transition-colors text-[13px]">
                Skills
              </Link>
              <Link
                to="/docs/$"
                params={{ _splat: '' }}
                className="hover:text-foreground transition-colors text-[13px]">
                Docs
              </Link>
              <a
                href="https://github.com/tankpkg/tank"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 hover:text-foreground transition-colors text-[13px]">
                <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path fillRule="evenodd" d={GITHUB_ICON_PATH} clipRule="evenodd" />
                </svg>
                GitHub
              </a>
              <CookiePreferencesButton />
            </div>
          </div>
        </div>
      </footer>

      <CommandMenu />
    </div>
  );
}
