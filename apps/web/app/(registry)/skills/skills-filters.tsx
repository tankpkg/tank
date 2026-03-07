'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { X, SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { ScoreBucket, VisibilityFilter } from '@/lib/data/skills';

interface SkillsFiltersProps {
  currentVisibility: VisibilityFilter;
  currentScoreBucket: ScoreBucket;
  isLoggedIn: boolean;
}

export function SkillsFilters({
  currentVisibility,
  currentScoreBucket,
  isLoggedIn,
}: SkillsFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const hasActiveFilters =
    currentVisibility !== 'all' || currentScoreBucket !== 'all';

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set(key, value);
    params.delete('page');
    router.replace(`${pathname}?${params.toString()}`);
  }

  function clearFilters() {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('visibility');
    params.delete('score');
    params.delete('page');
    router.replace(`${pathname}?${params.toString()}`);
  }

  const scoreBuckets: { value: ScoreBucket; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'high', label: 'High (7+)' },
    { value: 'medium', label: 'Med (4–6)' },
    { value: 'low', label: 'Low (<4)' },
  ];

  return (
    <aside
      className="w-full md:w-56 shrink-0"
      data-testid="skills-filters-sidebar"
    >
      <div
        className={cn(
          'rounded-lg border border-border/60 bg-card/50 p-4 space-y-5',
          'backdrop-blur-sm',
        )}
        style={{ borderColor: 'rgba(0, 212, 255, 0.08)' }}
      >
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
              data-testid="skills-filters-clear"
            >
              <X className="size-3" />
              Clear
            </button>
          )}
        </div>

        {isLoggedIn && (
          <FilterSection label="Visibility">
            <div className="flex flex-col gap-1.5">
              {(['all', 'public', 'private'] as VisibilityFilter[]).map((v) => (
                <button
                  type="button"
                  key={v}
                  onClick={() => updateParam('visibility', v)}
                  data-testid={`filter-visibility-${v}`}
                  className={cn(
                    'w-full text-left px-2.5 py-1.5 rounded-md text-sm transition-all',
                    currentVisibility === v
                      ? 'text-foreground font-medium'
                      : 'text-muted-foreground hover:text-foreground hover:bg-white/5',
                  )}
                  style={
                    currentVisibility === v
                      ? {
                          background: 'rgba(0, 212, 255, 0.08)',
                          borderLeft: '2px solid var(--tank-cyan)',
                          paddingLeft: '8px',
                          boxShadow: 'inset 0 0 12px rgba(0, 212, 255, 0.05)',
                        }
                      : undefined
                  }
                >
                  {v === 'all' ? 'All' : v === 'public' ? 'Public' : 'Private'}
                </button>
              ))}
            </div>
          </FilterSection>
        )}

        <FilterSection label="Security Score">
          <div className="flex flex-col gap-1.5">
            {scoreBuckets.map(({ value, label }) => (
              <button
                type="button"
                key={value}
                onClick={() => updateParam('score', value)}
                data-testid={`filter-score-${value}`}
                className={cn(
                  'w-full text-left px-2.5 py-1.5 rounded-md text-sm transition-all',
                  currentScoreBucket === value
                    ? 'text-foreground font-medium'
                    : 'text-muted-foreground hover:text-foreground hover:bg-white/5',
                )}
                style={
                  currentScoreBucket === value
                    ? {
                        background: 'rgba(0, 212, 255, 0.08)',
                        borderLeft: '2px solid var(--tank-cyan)',
                        paddingLeft: '8px',
                        boxShadow: 'inset 0 0 12px rgba(0, 212, 255, 0.05)',
                      }
                    : undefined
                }
              >
                <span className="flex items-center gap-2">
                  {value !== 'all' && (
                    <ScoreDot bucket={value} />
                  )}
                  {label}
                </span>
              </button>
            ))}
          </div>
        </FilterSection>

        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearFilters}
            className="w-full text-muted-foreground hover:text-foreground text-xs"
            data-testid="skills-filters-clear-bottom"
          >
            <X className="size-3" />
            Clear all filters
          </Button>
        )}
      </div>
    </aside>
  );
}

function FilterSection({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">
        {label}
      </p>
      {children}
    </div>
  );
}

function ScoreDot({ bucket }: { bucket: ScoreBucket }) {
  const colors: Record<string, string> = {
    high: 'var(--tank-matrix-green)',
    medium: 'var(--tank-amber)',
    low: '#ef4444',
  };
  return (
    <span
      className="inline-block size-2 rounded-full shrink-0"
      style={{ background: colors[bucket] ?? 'currentColor' }}
    />
  );
}
