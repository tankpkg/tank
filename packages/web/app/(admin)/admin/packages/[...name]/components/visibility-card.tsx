'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';

type SkillVisibility = 'public' | 'private';

export function VisibilityCard({
  packageName,
  currentVisibility
}: {
  packageName: string;
  currentVisibility: SkillVisibility;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [visibility, setVisibility] = useState<SkillVisibility>(currentVisibility);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const onSubmit = () => {
    setError(null);
    setSuccess(null);

    startTransition(async () => {
      try {
        const response = await fetch(`/api/admin/packages/${encodeURIComponent(packageName)}/visibility`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ visibility })
        });

        const payload = (await response.json()) as { error?: string };
        if (!response.ok) {
          setError(payload.error ?? 'Failed to update visibility.');
          return;
        }

        setSuccess('Visibility updated.');
        router.refresh();
      } catch {
        setError('Unexpected error while updating visibility.');
      }
    });
  };

  return (
    <div className="space-y-4 rounded-lg border p-4">
      <h2 className="text-lg font-semibold">Visibility</h2>
      <div className="space-y-2">
        <label htmlFor="visibility" className="text-sm font-medium">
          Package visibility
        </label>
        <select
          id="visibility"
          value={visibility}
          onChange={(event) => setVisibility(event.target.value as SkillVisibility)}
          className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
          disabled={isPending}>
          <option value="public">Public</option>
          <option value="private">Private</option>
        </select>
      </div>

      <Button type="button" onClick={onSubmit} disabled={isPending || visibility === currentVisibility}>
        Save visibility
      </Button>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {success ? <p className="text-sm text-emerald-600">{success}</p> : null}
    </div>
  );
}
