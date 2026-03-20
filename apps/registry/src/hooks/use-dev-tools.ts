import { useHotkey } from '@tanstack/react-hotkeys';
import { useCallback, useState } from 'react';

export function useDevTools() {
  const [visible, setVisible] = useState(() => {
    if (!import.meta.env.DEV || typeof window === 'undefined') return false;
    return localStorage.getItem('tank-devtools') === 'true';
  });

  const toggle = useCallback(() => {
    if (!import.meta.env.DEV) return;
    setVisible((v) => {
      const next = !v;
      localStorage.setItem('tank-devtools', String(next));
      try {
        const w = window as unknown as Record<string, unknown>;
        const rs = w.__REACT_SCAN__;
        if (rs && typeof rs === 'object' && 'ReactScanInternals' in (rs as object)) {
          const internals = (rs as Record<string, unknown>).ReactScanInternals as Record<string, unknown>;
          if (typeof internals.options === 'object' && internals.options) {
            (internals.options as Record<string, unknown>).enabled = next;
          }
        }
      } catch {}
      return next;
    });
  }, []);

  useHotkey({ key: 'd', mod: true, shift: true }, () => toggle());

  return visible;
}
