'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';

export function DeleteVersionButton({ packageName, version }: { packageName: string; version: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const onDelete = () => {
    setError(null);

    const confirmed = window.confirm(`Delete version ${version} from ${packageName}? This cannot be undone.`);
    if (!confirmed) {
      return;
    }

    startTransition(async () => {
      try {
        const response = await fetch(
          `/api/admin/packages/${encodeURIComponent(packageName)}/versions/${encodeURIComponent(version)}`,
          { method: 'DELETE' }
        );

        const payload = (await response.json()) as { error?: string };
        if (!response.ok) {
          setError(payload.error ?? 'Failed to delete version.');
          return;
        }

        router.refresh();
      } catch {
        setError('Unexpected error while deleting version.');
      }
    });
  };

  return (
    <div className="flex flex-col items-end gap-2">
      <Button type="button" size="sm" variant="outline" onClick={onDelete} disabled={isPending}>
        Delete version
      </Button>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
