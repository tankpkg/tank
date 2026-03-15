import { Link } from '@tanstack/react-router';
import { ArrowLeft, Search, Shield } from 'lucide-react';

import { Button } from '~/components/ui/button';

export function NotFoundScreen() {
  return (
    <div className="flex min-h-screen flex-col">
      <div className="tank-gradient-bg tank-grid-overlay flex flex-1 items-center justify-center px-4">
        <div className="mx-auto max-w-lg text-center">
          <div className="mb-6 inline-flex items-center justify-center rounded-full border border-border/50 bg-muted/30 p-4">
            <Shield className="size-8 text-[var(--tank-cyan)]" />
          </div>

          <h1 className="mb-2 text-6xl font-extrabold tracking-tight text-foreground">404</h1>
          <p className="mb-2 text-xl font-semibold text-foreground">Page not found</p>
          <p className="mb-8 text-muted-foreground">
            The page you're looking for doesn't exist or has been moved.
          </p>

          <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Button asChild size="lg" className="gap-2 bg-[var(--brand-primary)] hover:bg-[var(--brand-primary)]/90">
              <Link to="/">
                <ArrowLeft className="size-4" />
                Go Home
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="gap-2">
              <Link to="/skills">
                <Search className="size-4" />
                Browse Skills
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
