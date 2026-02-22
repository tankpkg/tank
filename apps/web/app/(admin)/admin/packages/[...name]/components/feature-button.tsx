'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

export function FeatureButton({
  packageName,
  featured,
}: {
  packageName: string;
  featured: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const onToggle = () => {
    setError(null);
    startTransition(async () => {
      try {
        const response = await fetch(
          `/api/admin/packages/${encodeURIComponent(packageName)}/feature`,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ featured: !featured }),
          },
        );

        const payload = (await response.json()) as { error?: string };
        if (!response.ok) {
          setError(payload.error ?? 'Failed to update featured state.');
          return;
        }

        router.refresh();
      } catch {
        setError('Unexpected error while updating featured state.');
      }
    });
  };

  return (
    <div className="space-y-2">
      <Button variant={featured ? 'outline' : 'default'} onClick={onToggle} disabled={isPending}>
        {featured ? 'Remove featured' : 'Mark as featured'}
      </Button>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
