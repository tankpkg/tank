import { Link, useMatches } from '@tanstack/react-router';
import { BookOpen, ChevronRight, Menu, X } from 'lucide-react';
import { useEffect, useState } from 'react';

import type { DocMeta } from '~/lib/docs-meta';

const SIDEBAR_ORDER: Array<DocMeta | { separator: string }> = [
  { slug: 'index', title: 'Overview' },
  { slug: 'getting-started', title: 'Getting Started' },
  { separator: 'Guides' },
  { slug: 'publishing', title: 'Publishing' },
  { slug: 'installing', title: 'Installing' },
  { slug: 'organizations', title: 'Organizations' },
  { slug: 'search', title: 'Search' },
  { slug: 'cicd', title: 'CI/CD' },
  { slug: 'github-action', title: 'GitHub Action' },
  { slug: 'self-hosting', title: 'Self-Hosting' },
  { separator: 'Security' },
  { slug: 'security', title: 'Security Model' },
  { slug: 'permissions', title: 'Permissions' },
  { slug: 'security-checklist', title: 'Security Checklist' },
  { separator: 'Reference' },
  { slug: 'cli', title: 'CLI' },
  { slug: 'mcp', title: 'MCP' },
  { slug: 'api', title: 'API' },
  { separator: 'Quick Starts' },
  { slug: 'publish-first-skill', title: 'Publish First Skill' },
  { slug: 'self-host-quickstart', title: 'Self-Host Quickstart' }
];

function isSeparator(item: DocMeta | { separator: string }): item is { separator: string } {
  return 'separator' in item;
}

function useActiveSlug(): string | null {
  const matches = useMatches();
  const last = matches[matches.length - 1];
  if (!last) return null;

  const splat = (last.params as Record<string, string>)._splat;
  if (splat) return splat;

  if (last.fullPath.endsWith('/docs') || last.fullPath.endsWith('/docs/')) return 'index';
  return null;
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const activeSlug = useActiveSlug();

  return (
    <nav className="flex flex-col gap-1">
      <div className="flex items-center gap-2 px-3 pb-4 mb-2 border-b border-emerald-500/10">
        <BookOpen className="h-4 w-4 text-emerald-400" />
        <span className="text-sm font-semibold text-foreground">Documentation</span>
      </div>
      {SIDEBAR_ORDER.map((item, i) => {
        if (isSeparator(item)) {
          return (
            <div key={item.separator} className={`px-3 pt-4 ${i > 0 ? 'mt-2' : ''}`}>
              <span className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground/60">
                {item.separator}
              </span>
            </div>
          );
        }

        const isActive = activeSlug === item.slug;
        const to = item.slug === 'index' ? '/docs' : `/docs/${item.slug}`;

        return (
          <Link
            key={item.slug}
            to={to}
            onClick={onNavigate}
            className={`group flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm transition-colors ${
              isActive
                ? 'bg-emerald-500/10 text-emerald-400 font-medium'
                : 'text-muted-foreground hover:bg-emerald-500/5 hover:text-foreground'
            }`}>
            {isActive && <ChevronRight className="h-3 w-3 shrink-0" />}
            <span>{item.title}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function DocsLayout({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (!mobileOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileOpen(false);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [mobileOpen]);

  return (
    <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex gap-8">
        {/* Mobile toggle */}
        <button
          type="button"
          onClick={() => setMobileOpen(!mobileOpen)}
          className="fixed bottom-4 right-4 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg lg:hidden"
          aria-label="Toggle docs navigation">
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>

        {/* Mobile sidebar overlay */}
        {mobileOpen && (
          <div className="fixed inset-0 z-40 lg:hidden">
            {/* biome-ignore lint/a11y/noStaticElementInteractions: backdrop overlay dismiss */}
            {/* biome-ignore lint/a11y/useKeyWithClickEvents: backdrop overlay dismiss */}
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
            <aside className="absolute left-0 top-0 h-full w-72 overflow-y-auto bg-background border-r border-emerald-500/10 p-6">
              <SidebarContent onNavigate={() => setMobileOpen(false)} />
            </aside>
          </div>
        )}

        {/* Desktop sidebar */}
        <aside className="hidden lg:block w-64 shrink-0">
          <div className="sticky top-24 max-h-[calc(100vh-8rem)] overflow-y-auto pr-2">
            <SidebarContent />
          </div>
        </aside>

        {/* Main content */}
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
