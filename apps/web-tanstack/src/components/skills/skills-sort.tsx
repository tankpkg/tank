import { useNavigate } from '@tanstack/react-router';

import type { SortOption } from '~/lib/skills/data';

interface SkillsSortProps {
  currentSort: SortOption;
}

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'updated', label: 'Recently updated' },
  { value: 'downloads', label: 'Most downloads' },
  { value: 'stars', label: 'Most stars' },
  { value: 'score', label: 'Highest score' },
  { value: 'name', label: 'Name' }
];

export function SkillsSort({ currentSort }: SkillsSortProps) {
  const navigate = useNavigate();

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const value = e.target.value as SortOption;
    navigate({
      to: '/skills',
      search: (prev: Record<string, unknown>) => ({
        ...prev,
        sort: value,
        page: 1
      })
    } as never);
  }

  return (
    <div className="flex items-center gap-2">
      <label htmlFor="skills-sort" className="text-sm text-muted-foreground whitespace-nowrap">
        Sort by
      </label>
      <select
        id="skills-sort"
        value={currentSort}
        onChange={handleChange}
        className="h-8 rounded-md border border-input bg-background px-2 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50">
        {SORT_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
