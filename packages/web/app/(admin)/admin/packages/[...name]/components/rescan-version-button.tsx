'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';

export function RescanVersionButton({ packageName, version }: { packageName: string; version: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const onRescan = () => {
    setError(null);

    startTransition(async () => {
      try {
        const response = await fetch(
          `/api/admin/packages/${encodeURIComponent(packageName)}/versions/${encodeURIComponent(version)}/rescan`,
          { method: 'POST' }
        );

        const payload = (await response.json()) as { error?: string };
        if (!response.ok) {
          setError(payload.error ?? 'Failed to rescan version.');
          return;
        }

        router.refresh();
      } catch {
        setError('Unexpected error while rescanning version.');
      }
    });
  };

  return (
    <div className="flex flex-col items-end gap-2">
      <Button type="button" size="sm" variant="outline" onClick={onRescan} disabled={isPending}>
        {isPending ? 'Rescanning…' : 'Rescan'}
      </Button>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
