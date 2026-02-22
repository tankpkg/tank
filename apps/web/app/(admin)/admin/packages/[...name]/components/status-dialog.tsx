'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

type PackageStatus = 'active' | 'deprecated' | 'quarantined' | 'removed';

export function StatusDialog({
  packageName,
  currentStatus,
}: {
  packageName: string;
  currentStatus: PackageStatus;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [status, setStatus] = useState<PackageStatus>(currentStatus);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const onSubmit = () => {
    setError(null);
    setSuccess(null);

    startTransition(async () => {
      try {
        const response = await fetch(
          `/api/admin/packages/${encodeURIComponent(packageName)}/status`,
          {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ status, reason: reason.trim() }),
          },
        );

        const payload = (await response.json()) as { error?: string };
        if (!response.ok) {
          setError(payload.error ?? 'Failed to update package status.');
          return;
        }

        setSuccess('Package status updated.');
        setReason('');
        router.refresh();
      } catch {
        setError('Unexpected error while updating status.');
      }
    });
  };

  return (
    <div className="space-y-4 rounded-lg border p-4">
      <h2 className="text-lg font-semibold">Moderation</h2>

      <div className="space-y-2">
        <label htmlFor="status" className="text-sm font-medium">
          Status
        </label>
        <select
          id="status"
          value={status}
          onChange={(event) => setStatus(event.target.value as PackageStatus)}
          className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
          disabled={isPending}
        >
          <option value="active">Active</option>
          <option value="deprecated">Deprecated</option>
          <option value="quarantined">Quarantined</option>
          <option value="removed">Removed</option>
        </select>
      </div>

      <div className="space-y-2">
        <label htmlFor="reason" className="text-sm font-medium">
          Reason
        </label>
        <textarea
          id="reason"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Required"
          rows={3}
          className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
          disabled={isPending}
        />
      </div>

      <Button
        onClick={onSubmit}
        disabled={isPending || reason.trim().length === 0 || (status === currentStatus && reason.trim().length === 0)}
      >
        Save status
      </Button>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {success ? <p className="text-sm text-emerald-600">{success}</p> : null}
    </div>
  );
}
