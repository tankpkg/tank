import { Link } from '@tanstack/react-router';
import { ShieldCheck, X } from 'lucide-react';
import { useEffect, useState } from 'react';

const STORAGE_KEY = 'tank-value-banner-dismissed';
const COOKIE_KEY = 'tank_vbd';

function readDismissedCookie(): boolean {
  if (typeof document === 'undefined') return false;
  return document.cookie.split('; ').some((c) => c === `${COOKIE_KEY}=1`);
}

export function ValueBanner() {
  const [mounted, setMounted] = useState(false);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    const persisted = localStorage.getItem(STORAGE_KEY) === '1' || readDismissedCookie();
    setDismissed(persisted);
    setMounted(true);
  }, []);

  if (!mounted || dismissed) {
    return <div data-testid="value-banner-slot" hidden aria-hidden="true" />;
  }

  return (
    <div
      data-testid="value-banner"
      className="mb-4 rounded-lg border border-tank/15 bg-tank/[0.02] px-4 py-3 flex items-center gap-3 flex-wrap">
      <ShieldCheck className="size-4 text-tank shrink-0" />
      <p className="text-sm text-muted-foreground flex-1 min-w-0">
        Every package here is scanned through a 6-stage security pipeline.
        <Link
          to="/docs/$"
          params={{ _splat: 'overview' }}
          className="ml-1 text-tank hover:underline font-medium whitespace-nowrap">
          Learn more →
        </Link>
      </p>
      <button
        type="button"
        data-testid="value-banner-dismiss"
        className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
        aria-label="Dismiss banner"
        onClick={() => {
          localStorage.setItem(STORAGE_KEY, '1');
          document.cookie = `${COOKIE_KEY}=1; path=/; max-age=31536000; samesite=lax`;
          setDismissed(true);
        }}>
        <X className="size-4" />
      </button>
    </div>
  );
}
