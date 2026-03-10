'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';

type AccessGrant = {
  id: string;
  grantedUserId: string | null;
  grantedOrgId: string | null;
  userName: string | null;
  userEmail: string | null;
  orgName: string | null;
  orgSlug: string | null;
};

export function AccessGrantsCard({ packageName }: { packageName: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [grants, setGrants] = useState<AccessGrant[]>([]);
  const [userIdsInput, setUserIdsInput] = useState('');
  const [orgIdsInput, setOrgIdsInput] = useState('');

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/admin/packages/${encodeURIComponent(packageName)}/access-grants`);
        const payload = (await response.json()) as { error?: string; grants?: AccessGrant[] };

        if (!response.ok) {
          if (!cancelled) setError(payload.error ?? 'Failed to load access grants.');
          return;
        }

        if (!cancelled) {
          const nextGrants = payload.grants ?? [];
          setGrants(nextGrants);
          const userIds = nextGrants.map((grant) => grant.grantedUserId).filter((id): id is string => Boolean(id));
          const orgIds = nextGrants.map((grant) => grant.grantedOrgId).filter((id): id is string => Boolean(id));
          setUserIdsInput(Array.from(new Set(userIds)).join(', '));
          setOrgIdsInput(Array.from(new Set(orgIds)).join(', '));
        }
      } catch {
        if (!cancelled) setError('Unexpected error while loading access grants.');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [packageName]);

  const displayRows = useMemo(() => grants.slice(0, 12), [grants]);

  const parseIds = (value: string) =>
    Array.from(
      new Set(
        value
          .split(',')
          .map((part) => part.trim())
          .filter((part) => part.length > 0)
      )
    );

  const onSave = () => {
    setError(null);
    setSuccess(null);

    startTransition(async () => {
      try {
        const response = await fetch(`/api/admin/packages/${encodeURIComponent(packageName)}/access-grants`, {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            userIds: parseIds(userIdsInput),
            orgIds: parseIds(orgIdsInput)
          })
        });

        const payload = (await response.json()) as { error?: string; grants?: AccessGrant[] };
        if (!response.ok) {
          setError(payload.error ?? 'Failed to save access grants.');
          return;
        }

        setSuccess('Access grants updated.');
        router.refresh();

        const refreshed = await fetch(`/api/admin/packages/${encodeURIComponent(packageName)}/access-grants`);
        const refreshedPayload = (await refreshed.json()) as { grants?: AccessGrant[] };
        if (refreshed.ok) {
          setGrants(refreshedPayload.grants ?? []);
        }
      } catch {
        setError('Unexpected error while saving access grants.');
      }
    });
  };

  return (
    <div className="space-y-4 rounded-lg border p-4">
      <h2 className="text-lg font-semibold">Explicit access grants</h2>
      <p className="text-sm text-muted-foreground">
        For private skills, grant additional access by user IDs or organization IDs.
      </p>

      <div className="space-y-2">
        <label htmlFor="access-user-ids" className="text-sm font-medium">
          User IDs (comma-separated)
        </label>
        <textarea
          id="access-user-ids"
          rows={2}
          value={userIdsInput}
          onChange={(event) => setUserIdsInput(event.target.value)}
          className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
          disabled={isPending || isLoading}
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="access-org-ids" className="text-sm font-medium">
          Organization IDs (comma-separated)
        </label>
        <textarea
          id="access-org-ids"
          rows={2}
          value={orgIdsInput}
          onChange={(event) => setOrgIdsInput(event.target.value)}
          className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
          disabled={isPending || isLoading}
        />
      </div>

      <Button type="button" onClick={onSave} disabled={isPending || isLoading}>
        Save access grants
      </Button>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {success ? <p className="text-sm text-emerald-600">{success}</p> : null}

      <div className="space-y-1">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Current grants</p>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : displayRows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No explicit grants configured.</p>
        ) : (
          <div className="space-y-1 text-xs">
            {displayRows.map((grant) => (
              <div key={grant.id} className="rounded border px-2 py-1">
                {grant.grantedUserId
                  ? `User: ${grant.userName ?? grant.userEmail ?? grant.grantedUserId}`
                  : `Org: ${grant.orgName ?? grant.orgSlug ?? grant.grantedOrgId}`}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
