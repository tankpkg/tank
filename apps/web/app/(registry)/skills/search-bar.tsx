'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { trackSkillSearch } from '@/lib/analytics';

export function SearchBar({ defaultValue }: { defaultValue: string }) {
  const router = useRouter();
  const [query, setQuery] = useState(defaultValue);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const currentParams = new URLSearchParams(window.location.search);
    if (query.trim()) {
      currentParams.set('q', query.trim());
    } else {
      currentParams.delete('q');
    }
    currentParams.delete('page');
    if (query.trim()) {
      trackSkillSearch(query.trim());
    }
    const qs = currentParams.toString();
    router.push(`/skills${qs ? `?${qs}` : ''}`);
  };

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <Input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search skills..."
        className="flex-1"
        data-testid="skills-filter-input"
      />
      <Button type="submit" variant="secondary">
        Search
      </Button>
    </form>
  );
}
