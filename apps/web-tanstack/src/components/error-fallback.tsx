import type { ErrorComponentProps } from '@tanstack/react-router';
import { Link, useRouter } from '@tanstack/react-router';
import { ArrowLeft, RefreshCw, Shield } from 'lucide-react';

import { StatusPage } from '~/components/status-page';
import { Button } from '~/components/ui/button';

export function ErrorFallback({ error, reset }: ErrorComponentProps) {
  const router = useRouter();
  const message = error instanceof Error ? error.message : 'An unexpected error occurred';

  return (
    <StatusPage
      icon={<Shield className="size-8 text-destructive" />}
      title="Something went wrong"
      description={message}>
      <Button
        size="lg"
        className="gap-2 bg-brand hover:bg-brand/90"
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
    </StatusPage>
  );
}
