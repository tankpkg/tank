'use client';

import { SearchIcon } from 'lucide-react';
import { useEffect, useState } from 'react';

export function SearchTrigger() {
  const [isMac, setIsMac] = useState(true);

  useEffect(() => {
    setIsMac(!navigator.userAgent.includes('Windows'));
  }, []);

  function openCommandMenu() {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }));
  }

  return (
    <button
      data-testid="search-trigger"
      type="button"
      onClick={openCommandMenu}
      className="group flex w-full items-center gap-2 rounded-lg border border-input bg-muted/30 px-3 py-1.5 text-sm text-muted-foreground/70 transition-all hover:border-muted-foreground/25 hover:bg-muted/50 hover:text-muted-foreground">
      <SearchIcon className="size-4 shrink-0" />
      <span className="flex-1 text-left">Search skills, docs...</span>
      <kbd className="pointer-events-none hidden select-none items-center gap-0.5 rounded border border-border bg-background px-1.5 py-0.5 font-mono text-[10px] font-medium text-muted-foreground/70 sm:inline-flex">
        {isMac ? '⌘' : 'Ctrl '}K
      </kbd>
    </button>
  );
}
