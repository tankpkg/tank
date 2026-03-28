import { useNavigate } from '@tanstack/react-router';
import { FileText } from 'lucide-react';

import { Button } from '~/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select';
import type { FreshnessBucket, PopularityBucket, ScoreBucket, VisibilityFilter } from '~/lib/skills/data';

import { FRESHNESS_OPTIONS, POPULARITY_OPTIONS, SCORE_OPTIONS, VISIBILITY_OPTIONS } from './skills-filters';

interface MobileSkillsFiltersProps {
  currentVisibility: VisibilityFilter;
  currentScoreBucket: ScoreBucket;
  currentFreshness: FreshnessBucket;
  currentPopularity: PopularityBucket;
  currentHasReadme: boolean;
  isLoggedIn: boolean;
}

function useFilterNavigate() {
  const navigate = useNavigate();
  return (paramKey: string, value: string, defaultValue: string) => {
    navigate({
      to: '/skills',
      search: (prev: Record<string, unknown>) => ({
        ...prev,
        [paramKey]: value === defaultValue ? undefined : value,
        page: 1
      })
    } as never);
  };
}

export function MobileSkillsFilters({
  currentVisibility,
  currentScoreBucket,
  currentFreshness,
  currentPopularity,
  currentHasReadme,
  isLoggedIn
}: MobileSkillsFiltersProps) {
  const filterNav = useFilterNavigate();
  const navigate = useNavigate();

  return (
    <div className="flex gap-2 overflow-x-auto pb-1 lg:hidden" data-testid="mobile-filter-bar">
      {isLoggedIn && (
        <Select value={currentVisibility} onValueChange={(v) => filterNav('visibility', v, 'all')}>
          <SelectTrigger className="h-8 min-w-[100px] shrink-0 text-xs" data-testid="mobile-filter-visibility">
            <SelectValue placeholder="Visibility" />
          </SelectTrigger>
          <SelectContent>
            {VISIBILITY_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      <Select value={currentScoreBucket} onValueChange={(v) => filterNav('score', v, 'all')}>
        <SelectTrigger className="h-8 min-w-[110px] shrink-0 text-xs" data-testid="mobile-filter-score">
          <SelectValue placeholder="Score" />
        </SelectTrigger>
        <SelectContent>
          {SCORE_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={currentFreshness} onValueChange={(v) => filterNav('freshness', v, 'all')}>
        <SelectTrigger className="h-8 min-w-[100px] shrink-0 text-xs" data-testid="mobile-filter-freshness">
          <SelectValue placeholder="Freshness" />
        </SelectTrigger>
        <SelectContent>
          {FRESHNESS_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={currentPopularity} onValueChange={(v) => filterNav('popularity', v, 'all')}>
        <SelectTrigger className="h-8 min-w-[100px] shrink-0 text-xs" data-testid="mobile-filter-popularity">
          <SelectValue placeholder="Popularity" />
        </SelectTrigger>
        <SelectContent>
          {POPULARITY_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Button
        variant={currentHasReadme ? 'default' : 'outline'}
        size="sm"
        className="h-8 shrink-0 gap-1 text-xs"
        onClick={() => {
          navigate({
            to: '/skills',
            search: (prev: Record<string, unknown>) => ({
              ...prev,
              docs: !currentHasReadme,
              page: 1
            })
          } as never);
        }}
        data-testid="mobile-filter-docs">
        <FileText className="size-3" />
        Docs
      </Button>
    </div>
  );
}
