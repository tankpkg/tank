'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

type UserRole = 'user' | 'admin';
type UserStatus = 'active' | 'suspended' | 'banned';

export function StatusDialog({
  userId,
  currentRole,
  currentStatus,
  isSelf,
}: {
  userId: string;
  currentRole: UserRole;
  currentStatus: UserStatus;
  isSelf: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [role, setRole] = useState<UserRole>(currentRole);
  const [status, setStatus] = useState<UserStatus>(currentStatus);
  const [reason, setReason] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const roleChanged = useMemo(() => role !== currentRole, [role, currentRole]);
  const statusChanged = useMemo(() => {
    return status !== currentStatus || reason.trim() || expiresAt.trim();
  }, [status, currentStatus, reason, expiresAt]);

  const onRoleUpdate = () => {
    if (!roleChanged || isSelf) return;

    setError(null);
    setSuccess(null);
    startTransition(async () => {
      try {
        const response = await fetch(`/api/admin/users/${encodeURIComponent(userId)}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ role }),
        });

        const payload = (await response.json()) as { error?: string };
        if (!response.ok) {
          setError(payload.error ?? 'Failed to update role.');
          return;
        }

        setSuccess('Role updated.');
        router.refresh();
      } catch {
        setError('Unexpected error while updating role.');
      }
    });
  };

  const onStatusUpdate = () => {
    if (!statusChanged || isSelf) return;

    setError(null);
    setSuccess(null);
    startTransition(async () => {
      try {
        const response = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/status`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            status,
            reason: reason.trim() || undefined,
            expiresAt: expiresAt || undefined,
          }),
        });

        const payload = (await response.json()) as { error?: string };
        if (!response.ok) {
          setError(payload.error ?? 'Failed to update status.');
          return;
        }

        setSuccess('Status updated.');
        setReason('');
        setExpiresAt('');
        router.refresh();
      } catch {
        setError('Unexpected error while updating status.');
      }
    });
  };

  return (
    <div className="space-y-5 rounded-lg border p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Moderation</h2>
        <Badge variant="outline" className="capitalize">
          {currentStatus}
        </Badge>
      </div>

      {isSelf ? (
        <p className="text-sm text-muted-foreground">
          You cannot change your own role or status.
        </p>
      ) : null}

      <div className="space-y-2">
        <label htmlFor="role" className="text-sm font-medium">
          Role
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <select
            id="role"
            value={role}
            onChange={(event) => setRole(event.target.value as UserRole)}
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
            disabled={isPending || isSelf}
          >
            <option value="user">User</option>
            <option value="admin">Admin</option>
          </select>
          <Button
            variant="outline"
            onClick={onRoleUpdate}
            disabled={isPending || !roleChanged || isSelf}
          >
            Save role
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <label htmlFor="status" className="text-sm font-medium">
          Status
        </label>
        <select
          id="status"
          value={status}
          onChange={(event) => setStatus(event.target.value as UserStatus)}
          className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
          disabled={isPending || isSelf}
        >
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
          <option value="banned">Banned</option>
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
          rows={3}
          placeholder="Required for bans"
          className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
          disabled={isPending || isSelf}
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="expiresAt" className="text-sm font-medium">
          Expires at (optional)
        </label>
        <input
          id="expiresAt"
          type="datetime-local"
          value={expiresAt}
          onChange={(event) => setExpiresAt(event.target.value)}
          className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
          disabled={isPending || isSelf}
        />
      </div>

      <Button onClick={onStatusUpdate} disabled={isPending || !statusChanged || isSelf}>
        Save status
      </Button>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {success ? <p className="text-sm text-emerald-600">{success}</p> : null}
    </div>
  );
}
