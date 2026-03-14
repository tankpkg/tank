'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';

export type AccessGrant = {
  id: string;
  grantedUserId: string | null;
  grantedOrgId: string | null;
  userName: string | null;
  userEmail: string | null;
  orgName: string | null;
  orgSlug: string | null;
};

function getUniqueIds(values: Array<string | null>): string[] {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

export function AccessGrantsCard({
  packageName,
  initialGrants
}: {
  packageName: string;
  initialGrants: AccessGrant[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [grants, setGrants] = useState<AccessGrant[]>(initialGrants);
  const [userIdsInput, setUserIdsInput] = useState(
    getUniqueIds(initialGrants.map((grant) => grant.grantedUserId)).join(', ')
  );
  const [orgIdsInput, setOrgIdsInput] = useState(
    getUniqueIds(initialGrants.map((grant) => grant.grantedOrgId)).join(', ')
  );

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

        setIsLoading(true);
        const refreshed = await fetch(`/api/admin/packages/${encodeURIComponent(packageName)}/access-grants`);
        const refreshedPayload = (await refreshed.json()) as { grants?: AccessGrant[] };
        if (refreshed.ok) {
          const nextGrants = refreshedPayload.grants ?? [];
          setGrants(nextGrants);
          setUserIdsInput(getUniqueIds(nextGrants.map((grant) => grant.grantedUserId)).join(', '));
          setOrgIdsInput(getUniqueIds(nextGrants.map((grant) => grant.grantedOrgId)).join(', '));
        }
      } catch {
        setError('Unexpected error while saving access grants.');
      } finally {
        setIsLoading(false);
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
