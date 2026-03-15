import type { ErrorComponentProps } from '@tanstack/react-router';
import { Link, useRouter } from '@tanstack/react-router';
import { ArrowLeft, RefreshCw, Shield } from 'lucide-react';

import { Button } from '~/components/ui/button';

export function ErrorFallback({ error, reset }: ErrorComponentProps) {
  const router = useRouter();

  const message = error instanceof Error ? error.message : 'An unexpected error occurred';

  return (
    <div className="flex min-h-screen flex-col">
      <div className="tank-gradient-bg tank-grid-overlay flex flex-1 items-center justify-center px-4">
        <div className="mx-auto max-w-lg text-center">
          <div className="mb-6 inline-flex items-center justify-center rounded-full border border-border/50 bg-muted/30 p-4">
            <Shield className="size-8 text-destructive" />
          </div>

          <h1 className="mb-2 text-4xl font-extrabold tracking-tight text-foreground">Something went wrong</h1>
          <p className="mb-8 text-muted-foreground">{message}</p>

          <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Button
              size="lg"
              className="gap-2 bg-[var(--brand-primary)] hover:bg-[var(--brand-primary)]/90"
              onClick={() => {
                reset();
                router.invalidate();
              }}>
              <RefreshCw className="size-4" />
              Try again
            </Button>
            <Button asChild variant="outline" size="lg" className="gap-2">
              <Link to="/">
                <ArrowLeft className="size-4" />
                Go Home
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
