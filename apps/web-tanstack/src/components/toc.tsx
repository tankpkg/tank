import { useEffect, useState } from 'react';

import { cn } from '~/lib/utils';

interface Heading {
  id: string;
  text: string;
  level: number;
}

export function TableOfContents({ headings }: { headings: Heading[] }) {
  const [activeId, setActiveId] = useState<string>('');

  useEffect(() => {
    if (headings.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
          }
        }
      },
      { rootMargin: '0px 0px -80% 0px', threshold: 0.2 }
    );

    const elements = headings.map((h) => document.getElementById(h.id)).filter(Boolean) as HTMLElement[];

    for (const el of elements) observer.observe(el);
    return () => observer.disconnect();
  }, [headings]);

  if (headings.length < 2) return null;

  return (
    <nav className="hidden xl:block w-56 shrink-0" aria-label="Table of contents">
      <div className="sticky top-24 max-h-[calc(100vh-8rem)] overflow-y-auto">
        <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground/60 mb-3">
          On this page
        </p>
        <ul className="flex flex-col gap-1.5">
          {headings.map((heading) => (
            <li key={heading.id}>
              <a
                href={`#${heading.id}`}
                className={cn(
                  'block text-sm leading-snug transition-colors',
                  heading.level === 3 && 'pl-3',
                  heading.level >= 4 && 'pl-6',
                  activeId === heading.id
                    ? 'text-emerald-600 dark:text-emerald-400 font-medium'
                    : 'text-muted-foreground hover:text-foreground'
                )}
                aria-current={activeId === heading.id ? 'location' : undefined}>
                {heading.text}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}
