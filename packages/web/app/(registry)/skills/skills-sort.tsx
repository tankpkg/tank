'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { SortOption } from '@/lib/data/skills';

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'updated', label: 'Recently Updated' },
  { value: 'downloads', label: 'Most Downloads' },
  { value: 'stars', label: 'Most Stars' },
  { value: 'score', label: 'Highest Score' },
  { value: 'name', label: 'Name A–Z' }
];

export function SkillsSort({ currentSort }: { currentSort: SortOption }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

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

  return (
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
  );
}
