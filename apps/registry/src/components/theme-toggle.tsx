import { Moon, Sun } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

function getEffectiveTheme(): 'light' | 'dark' {
  if (typeof document === 'undefined') return 'dark';
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');

  useEffect(() => {
    setTheme(getEffectiveTheme());
  }, []);

  const toggle = useCallback(() => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);

    if (next === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }

    try {
      localStorage.setItem('tank-theme', next);
    } catch {}
  }, [theme]);

  const isDark = theme === 'dark';

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isDark}
      onClick={toggle}
      className="relative inline-flex h-7 w-[52px] shrink-0 items-center rounded-full border border-border/60 bg-muted/60 shadow-inner transition-colors duration-200 hover:bg-muted dark:border-tank/20 dark:bg-tank/10"
      aria-label={`Switch to ${isDark ? 'light' : 'dark'} mode`}>
      <Sun className="absolute left-1.5 h-3.5 w-3.5 text-amber-500 transition-opacity duration-200" style={{ opacity: isDark ? 0.3 : 1 }} />
      <Moon className="absolute right-1.5 h-3.5 w-3.5 text-blue-400 transition-opacity duration-200" style={{ opacity: isDark ? 1 : 0.3 }} />
      <span
        className="pointer-events-none block h-5 w-5 rounded-full bg-white shadow-md ring-0 transition-transform duration-200 dark:bg-slate-800"
        style={{ transform: isDark ? 'translateX(26px)' : 'translateX(3px)' }}
      />
    </button>
  );
}
