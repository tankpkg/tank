'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';

export function ForceDeleteCard({ packageName }: { packageName: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const onForceDelete = () => {
    setError(null);

    const firstConfirm = window.confirm(
      `This permanently deletes ${packageName}, all versions, and related scan/download records. Continue?`
    );
    if (!firstConfirm) {
      return;
    }

    const typedName = window.prompt(`Type the package name to confirm: ${packageName}`);
    if (typedName !== packageName) {
      setError('Confirmation failed: package name mismatch.');
      return;
    }

    const secondConfirm = window.confirm(
      'Final confirmation: this action is permanent and cannot be undone. Delete now?'
    );
    if (!secondConfirm) {
      return;
    }

    startTransition(async () => {
      try {
        const response = await fetch(`/api/admin/packages/${encodeURIComponent(packageName)}?force=true`, {
          method: 'DELETE',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            packageName,
            confirmText: 'DELETE',
            reason: reason.trim()
          })
        });

        const payload = (await response.json()) as { error?: string };
        if (!response.ok) {
          setError(payload.error ?? 'Failed to permanently delete package.');
          return;
        }

        router.push('/admin/packages');
        router.refresh();
      } catch {
        setError('Unexpected error while force deleting package.');
      }
    });
  };

  return (
    <div className="space-y-3 rounded-lg border border-destructive/30 p-4">
      <h2 className="text-lg font-semibold text-destructive">Danger zone</h2>
      <p className="text-sm text-muted-foreground">
        Force delete permanently removes this package and all of its versions.
      </p>

      <div className="space-y-2">
        <label htmlFor="force-delete-reason" className="text-sm font-medium">
          Reason (optional)
        </label>
        <textarea
          id="force-delete-reason"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          rows={2}
          placeholder="Reason for permanent deletion"
          className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
          disabled={isPending}
        />
      </div>

      <Button type="button" variant="destructive" onClick={onForceDelete} disabled={isPending}>
        Force delete package
      </Button>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
