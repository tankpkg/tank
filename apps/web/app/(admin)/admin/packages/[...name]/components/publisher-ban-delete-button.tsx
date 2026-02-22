'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export function PublisherBanDeleteButton({
  packageName,
  publisherId,
}: {
  packageName: string;
  publisherId: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const onBanAndDeleteAll = () => {
    setError(null);

    const firstConfirm = window.confirm(
      'This will ban the publisher and permanently delete all packages they published. Continue?',
    );
    if (!firstConfirm) {
      return;
    }

    const phrase = window.prompt('Type BAN DELETE to continue:');
    if (phrase !== 'BAN DELETE') {
      setError('Confirmation failed: expected phrase BAN DELETE.');
      return;
    }

    const secondConfirm = window.confirm('Final confirmation: this action is permanent and cannot be undone. Proceed?');
    if (!secondConfirm) {
      return;
    }

    startTransition(async () => {
      try {
        const response = await fetch(
          `/api/admin/packages/${encodeURIComponent(packageName)}/publisher-ban-delete`,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              packageName,
              confirmText: 'BAN_DELETE_ALL',
              reason: reason.trim(),
            }),
          },
        );

        const payload = (await response.json()) as { error?: string; publisherId?: string };
        if (!response.ok) {
          setError(payload.error ?? 'Failed to ban publisher and delete packages.');
          return;
        }

        router.push(payload.publisherId ? `/admin/users/${payload.publisherId}` : '/admin/users');
        router.refresh();
      } catch {
        setError('Unexpected error while banning publisher.');
      }
    });
  };

  return (
    <div className="mt-4 space-y-3 rounded border border-destructive/30 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-destructive">Publisher moderation</p>
        <Link href={`/admin/users/${publisherId}`} className="text-xs text-muted-foreground underline underline-offset-4">
          Open user profile
        </Link>
      </div>

      <textarea
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        rows={2}
        placeholder="Reason for banning publisher"
        className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
        disabled={isPending}
      />

      <Button
        type="button"
        variant="destructive"
        onClick={onBanAndDeleteAll}
        disabled={isPending}
      >
        Ban publisher + delete all packages
      </Button>

      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
