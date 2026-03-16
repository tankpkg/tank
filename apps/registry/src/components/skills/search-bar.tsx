import { useNavigate } from '@tanstack/react-router';
import { Search } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { Input } from '~/components/ui/input';

interface SearchBarProps {
  defaultValue: string;
}

export function SearchBar({ defaultValue }: SearchBarProps) {
  const navigate = useNavigate();
  const [value, setValue] = useState(defaultValue);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setValue(defaultValue);
  }, [defaultValue]);

  const doNavigate = useCallback(
    (q: string) => {
      navigate({
        to: '/skills',
        search: (prev: Record<string, unknown>) => ({
          ...prev,
          q: q || '',
          page: 1
        })
      } as never);
    },
    [navigate]
  );

  const scheduleNavigate = useCallback(
    (q: string) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => doNavigate(q), 300);
    },
    [doNavigate]
  );

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (timerRef.current) clearTimeout(timerRef.current);
        doNavigate(value);
      }}
      className="relative"
      data-testid="skills-search">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
      <Input
        type="search"
        name="q"
        placeholder="Search skills..."
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          scheduleNavigate(e.target.value);
        }}
        className="pl-9"
        autoComplete="off"
      />
    </form>
  );
}
