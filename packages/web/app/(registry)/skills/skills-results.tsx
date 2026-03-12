'use client';

import { Download, LayoutGrid, List, Lock, Star } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TrustBadge } from '@/components/security/TrustBadge';
import type { SkillSearchResult, SortOption } from '@/lib/data/skills';
import { computeTrustLevel } from '@/lib/trust-level';
import { cn } from '@/lib/utils';

type ViewMode = 'grid' | 'list';
const VIEW_STORAGE_KEY = 'tank-browse-view';

interface SkillsResultsProps {
  results: SkillSearchResult[];
  totalCount: number;
  currentSort: SortOption;
  currentQuery: string;
}

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'updated', label: 'Recently Updated' },
  { value: 'downloads', label: 'Most Downloads' },
  { value: 'stars', label: 'Most Stars' },
  { value: 'security', label: 'Most Secure' },
  { value: 'name', label: 'Name A–Z' }
];

export function SkillsResults({ results, totalCount, currentSort, currentQuery }: SkillsResultsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [view, setView] = useState<ViewMode>('grid');

  useEffect(() => {
    try {
      const stored = localStorage.getItem(VIEW_STORAGE_KEY);
      if (stored === 'grid' || stored === 'list') {
        setView(stored);
      }
    } catch {
      // localStorage unavailable (SSR or private mode)
    }
  }, []);

  function switchView(next: ViewMode) {
    setView(next);
    try {
      localStorage.setItem(VIEW_STORAGE_KEY, next);
    } catch {
      // ignore
    }
  }

  function handleSortChange(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === 'updated') {
      params.delete('sort');
    } else {
      params.set('sort', value);
    }
    params.delete('page');
    const qs = params.toString();
    router.push(`${pathname}${qs ? `?${qs}` : ''}`);
  }

  const countLabel = currentQuery
    ? `${totalCount.toLocaleString()} result${totalCount !== 1 ? 's' : ''} for "${currentQuery}"`
    : `${totalCount.toLocaleString()} skill${totalCount !== 1 ? 's' : ''}`;

  return (
    <div className="flex flex-col gap-4" data-testid="skills-results">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-muted-foreground" data-testid="skills-count">
          {countLabel}
        </p>

        <div className="flex items-center gap-2 ml-auto">
          <Select value={currentSort} onValueChange={handleSortChange}>
            <SelectTrigger size="sm" className="w-44" data-testid="skills-sort-select">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex items-center rounded-md border border-border/60 overflow-hidden">
            <button
              type="button"
              onClick={() => switchView('grid')}
              aria-label="Grid view"
              data-testid="view-toggle-grid"
              className={cn(
                'p-1.5 transition-colors',
                view === 'grid'
                  ? 'bg-white/10 text-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
              )}>
              <LayoutGrid className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => switchView('list')}
              aria-label="List view"
              data-testid="view-toggle-list"
              className={cn(
                'p-1.5 transition-colors',
                view === 'list'
                  ? 'bg-white/10 text-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
              )}>
              <List className="size-4" />
            </button>
          </div>
        </div>
      </div>

      {results.length === 0 ? (
        <EmptyState query={currentQuery} />
      ) : view === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4" data-testid="skills-grid">
          {results.map((skill) => (
            <SkillCard key={skill.name} skill={skill} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col divide-y divide-border/40" data-testid="skills-list">
          {results.map((skill) => (
            <SkillListItem key={skill.name} skill={skill} />
          ))}
        </div>
      )}
    </div>
  );
}

function SkillCard({ skill }: { skill: SkillSearchResult }) {
  const trustLevel = computeTrustLevel(
    skill.verdict,
    skill.criticalCount,
    skill.highCount,
    skill.mediumCount,
    skill.lowCount
  );

  return (
    <Link href={`/skills/${encodeURIComponent(skill.name)}`}>
      <Card className="tank-card h-full cursor-pointer">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="text-base leading-snug">{skill.name}</CardTitle>
            {skill.visibility === 'private' && <Lock className="size-3.5 text-muted-foreground shrink-0 mt-0.5" />}
          </div>
          {skill.description && <CardDescription className="line-clamp-2 text-xs">{skill.description}</CardDescription>}
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {skill.latestVersion && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                v{skill.latestVersion}
              </Badge>
            )}
            <TrustBadge
              trustLevel={trustLevel}
              findings={{ critical: skill.criticalCount, high: skill.highCount, medium: skill.mediumCount, low: skill.lowCount }}
              size="sm"
            />
            <span className="flex items-center gap-1 ml-auto">
              <Download className="size-3" />
              {skill.downloads.toLocaleString()}
            </span>
            <span className="flex items-center gap-1">
              <Star className="size-3" />
              {skill.stars.toLocaleString()}
            </span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function SkillListItem({ skill }: { skill: SkillSearchResult }) {
  const trustLevel = computeTrustLevel(
    skill.verdict,
    skill.criticalCount,
    skill.highCount,
    skill.mediumCount,
    skill.lowCount
  );

  return (
    <Link
      href={`/skills/${encodeURIComponent(skill.name)}`}
      className="flex items-center gap-3 py-3 px-1 hover:bg-white/[0.02] transition-colors group">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium group-hover:text-primary transition-colors truncate">{skill.name}</span>
          {skill.visibility === 'private' && <Lock className="size-3 text-muted-foreground shrink-0" />}
          {skill.latestVersion && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 shrink-0">
              v{skill.latestVersion}
            </Badge>
          )}
        </div>
        {skill.description && <p className="text-xs text-muted-foreground truncate mt-0.5">{skill.description}</p>}
      </div>

      <div className="flex items-center gap-3 shrink-0 text-xs text-muted-foreground">
        <TrustBadge
          trustLevel={trustLevel}
          findings={{ critical: skill.criticalCount, high: skill.highCount, medium: skill.mediumCount, low: skill.lowCount }}
          size="sm"
        />
        <span className="hidden sm:flex items-center gap-1">
          <Download className="size-3" />
          {skill.downloads.toLocaleString()}
        </span>
        <span className="flex items-center gap-1">
          <Star className="size-3" />
          {skill.stars.toLocaleString()}
        </span>
      </div>
    </Link>
  );
}

function EmptyState({ query }: { query: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border/40 py-16 text-center">
      <p className="text-lg font-medium">{query ? 'No skills found' : 'No skills published yet'}</p>
      <p className="mt-1 text-sm text-muted-foreground">
        {query
          ? `No results for "${query}". Try a different search term or adjust filters.`
          : 'Be the first to publish a skill!'}
      </p>
    </div>
  );
}
