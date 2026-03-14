'use client';

import { Clock, FileText, SlidersHorizontal, TrendingUp, X } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import { Button } from '@/components/ui/button';
import type { FreshnessBucket, PopularityBucket, ScoreBucket, VisibilityFilter } from '@/lib/data/skills';
import { cn } from '@/lib/utils';

interface SkillsFiltersProps {
  currentVisibility: VisibilityFilter;
  currentScoreBucket: ScoreBucket;
  currentFreshness: FreshnessBucket;
  currentPopularity: PopularityBucket;
  currentHasReadme: boolean;
  isLoggedIn: boolean;
}

const PARAM_DEFAULTS: Record<string, string> = {
  visibility: 'all',
  score: 'all',
  freshness: 'all',
  popularity: 'all',
  docs: ''
};

export function SkillsFilters({
  currentVisibility,
  currentScoreBucket,
  currentFreshness,
  currentPopularity,
  currentHasReadme,
  isLoggedIn
}: SkillsFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const hasActiveFilters =
    currentVisibility !== 'all' ||
    currentScoreBucket !== 'all' ||
    currentFreshness !== 'all' ||
    currentPopularity !== 'all' ||
    currentHasReadme;

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (PARAM_DEFAULTS[key] === value) {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    params.delete('page');
    const qs = params.toString();
    router.replace(`${pathname}${qs ? `?${qs}` : ''}`);
  }

  function toggleParam(key: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (params.has(key)) {
      params.delete(key);
    } else {
      params.set(key, '1');
    }
    params.delete('page');
    const qs = params.toString();
    router.replace(`${pathname}${qs ? `?${qs}` : ''}`);
  }

  function clearFilters() {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('visibility');
    params.delete('score');
    params.delete('freshness');
    params.delete('popularity');
    params.delete('docs');
    params.delete('page');
    const qs = params.toString();
    router.replace(`${pathname}${qs ? `?${qs}` : ''}`);
  }

  return (
    <aside data-testid="skills-filters-sidebar">
      <div
        className={cn('rounded-lg border border-border/60 bg-card/50 p-4 space-y-5', 'backdrop-blur-sm')}
        style={{ borderColor: 'rgba(0, 212, 255, 0.08)' }}>
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            <SlidersHorizontal className="size-3" />
            Filters
          </span>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              data-testid="skills-filters-clear">
              <X className="size-3" />
              Clear
            </button>
          )}
        </div>

        {isLoggedIn && (
          <FilterSection label="Visibility">
            <FilterOptionList
              options={[
                { value: 'all', label: 'All' },
                { value: 'public', label: 'Public' },
                { value: 'private', label: 'Private' }
              ]}
              current={currentVisibility}
              paramKey="visibility"
              onSelect={updateParam}
            />
          </FilterSection>
        )}

        <FilterSection label="Security Score">
          <FilterOptionList
            options={[
              { value: 'all', label: 'All' },
              { value: 'high', label: 'High (7+)', dot: 'var(--tank-matrix-green)' },
              { value: 'medium', label: 'Med (4–6)', dot: 'var(--tank-amber)' },
              { value: 'low', label: 'Low (<4)', dot: '#ef4444' }
            ]}
            current={currentScoreBucket}
            paramKey="score"
            onSelect={updateParam}
          />
        </FilterSection>

        <FilterSection label="Updated">
          <FilterOptionList
            options={[
              { value: 'all', label: 'Any time' },
              { value: 'week', label: 'This week' },
              { value: 'month', label: 'This month' },
              { value: 'year', label: 'This year' }
            ]}
            current={currentFreshness}
            paramKey="freshness"
            onSelect={updateParam}
            icon={<Clock className="size-3 text-muted-foreground/50" />}
          />
        </FilterSection>

        <FilterSection label="Downloads">
          <FilterOptionList
            options={[
              { value: 'all', label: 'Any' },
              { value: 'popular', label: 'Popular (10+)' },
              { value: 'growing', label: 'Growing (1–9)' },
              { value: 'new', label: 'New (0)' }
            ]}
            current={currentPopularity}
            paramKey="popularity"
            onSelect={updateParam}
            icon={<TrendingUp className="size-3 text-muted-foreground/50" />}
          />
        </FilterSection>

        <FilterSection label="Quality">
          <button
            type="button"
            onClick={() => toggleParam('docs')}
            data-testid="filter-has-readme"
            className={cn(
              'flex w-full items-center gap-2 text-left px-2.5 py-1.5 rounded-md text-sm transition-all',
              currentHasReadme
                ? 'text-foreground font-medium'
                : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
            )}
            style={
              currentHasReadme
                ? {
                    background: 'rgba(0, 212, 255, 0.08)',
                    borderLeft: '2px solid var(--tank-cyan)',
                    paddingLeft: '8px',
                    boxShadow: 'inset 0 0 12px rgba(0, 212, 255, 0.05)'
                  }
                : undefined
            }>
            <FileText className="size-3" />
            Has documentation
          </button>
        </FilterSection>

        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearFilters}
            className="w-full text-muted-foreground hover:text-foreground text-xs"
            data-testid="skills-filters-clear-bottom">
            <X className="size-3" />
            Clear all filters
          </Button>
        )}
      </div>
    </aside>
  );
}

function FilterSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">{label}</p>
      {children}
    </div>
  );
}

interface FilterOption {
  value: string;
  label: string;
  dot?: string;
}

function FilterOptionList({
  options,
  current,
  paramKey,
  onSelect,
  icon
}: {
  options: FilterOption[];
  current: string;
  paramKey: string;
  onSelect: (key: string, value: string) => void;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      {options.map(({ value, label, dot }) => (
        <button
          type="button"
          key={value}
          onClick={() => onSelect(paramKey, value)}
          data-testid={`filter-${paramKey}-${value}`}
          className={cn(
            'w-full text-left px-2.5 py-1.5 rounded-md text-sm transition-all',
            current === value
              ? 'text-foreground font-medium'
              : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
          )}
          style={
            current === value
              ? {
                  background: 'rgba(0, 212, 255, 0.08)',
                  borderLeft: '2px solid var(--tank-cyan)',
                  paddingLeft: '8px',
                  boxShadow: 'inset 0 0 12px rgba(0, 212, 255, 0.05)'
                }
              : undefined
          }>
          <span className="flex items-center gap-2">
            {dot && <span className="inline-block size-2 rounded-full shrink-0" style={{ background: dot }} />}
            {icon && value === options[0].value && icon}
            {label}
          </span>
        </button>
      ))}
    </div>
  );
}
