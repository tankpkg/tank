'use client';

import { type ChangeEvent, useEffect, useMemo, useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';

type ServiceAccountKey = {
  id: string;
  name: string;
  start: string;
  prefix: string;
  enabled: boolean;
  expiresAt: string | null;
  lastRequest: string | null;
  createdAt: string;
  scopes: string[];
};

type ServiceAccount = {
  id: string;
  userId: string;
  ownerUserId: string;
  orgId: string | null;
  displayName: string;
  description: string | null;
  disabled: boolean;
  createdAt: string;
  updatedAt: string;
  ownerName: string | null;
  ownerEmail: string | null;
  orgName: string | null;
  orgSlug: string | null;
  keys: ServiceAccountKey[];
};

const defaultScopes = ['skills:read'];

export default function AdminServiceAccountsPage() {
  const [isPending, startTransition] = useTransition();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [createdSecret, setCreatedSecret] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<ServiceAccount[]>([]);

  const [displayName, setDisplayName] = useState('');
  const [description, setDescription] = useState('');
  const [expiresInDays, setExpiresInDays] = useState('30');
  const [scopes, setScopes] = useState<string[]>(defaultScopes);

  const loadAccounts = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/admin/service-accounts');
      const payload = (await response.json()) as { error?: string; serviceAccounts?: ServiceAccount[] };
      if (!response.ok) {
        setError(payload.error ?? 'Failed to load service accounts.');
        return;
      }

      setAccounts(payload.serviceAccounts ?? []);
    } catch {
      setError('Unexpected error while loading service accounts.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadAccounts();
  }, [loadAccounts]);

  const toggleScope = (scope: string) => {
    setScopes((current: string[]) => {
      if (current.includes(scope)) {
        const next = current.filter((s: string) => s !== scope);
        return next.length === 0 ? ['skills:read'] : next;
      }

      return [...current, scope];
    });
  };

  const onCreateServiceAccount = () => {
    setError(null);
    setSuccess(null);

    startTransition(async () => {
      try {
        const response = await fetch('/api/admin/service-accounts', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            displayName,
            description: description.trim(),
            expiresInDays: Number(expiresInDays) || 30,
            scopes
          })
        });

        const payload = (await response.json()) as {
          error?: string;
          apiKey?: { key?: string };
        };

        if (!response.ok) {
          setError(payload.error ?? 'Failed to create service account.');
          return;
        }

        setSuccess('Service account created. Copy the key now.');
        setCreatedSecret(payload.apiKey?.key ?? null);
        setDisplayName('');
        setDescription('');
        setExpiresInDays('30');
        setScopes(defaultScopes);
        await loadAccounts();
      } catch {
        setError('Unexpected error while creating service account.');
      }
    });
  };

  const onToggleDisabled = (accountId: string, disabled: boolean) => {
    setError(null);
    setSuccess(null);

    startTransition(async () => {
      try {
        const response = await fetch(`/api/admin/service-accounts/${accountId}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ disabled })
        });
        const payload = (await response.json()) as { error?: string };
        if (!response.ok) {
          setError(payload.error ?? 'Failed to update account status.');
          return;
        }

        setSuccess(disabled ? 'Service account disabled.' : 'Service account enabled.');
        await loadAccounts();
      } catch {
        setError('Unexpected error while updating service account.');
      }
    });
  };

  const onCreateKey = (accountId: string, accountName: string) => {
    const expires = window.prompt(`Expires in days for ${accountName} key:`, '30');
    if (!expires) return;
    const scopeInput = window.prompt('Scopes (comma separated):', 'skills:read');
    if (scopeInput === null) return;

    const parsedScopes = Array.from(
      new Set(
        scopeInput
          .split(',')
          .map((value) => value.trim())
          .filter((value) => value.length > 0)
      )
    );

    startTransition(async () => {
      try {
        const response = await fetch(`/api/admin/service-accounts/${accountId}/keys`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            expiresInDays: Number(expires) || 30,
            scopes: parsedScopes
          })
        });
        const payload = (await response.json()) as { error?: string; apiKey?: { key?: string } };
        if (!response.ok) {
          setError(payload.error ?? 'Failed to create key.');
          return;
        }

        setSuccess('Service account key created. Copy now.');
        setCreatedSecret(payload.apiKey?.key ?? null);
        await loadAccounts();
      } catch {
        setError('Unexpected error while creating key.');
      }
    });
  };

  const onRevokeKey = (accountId: string, keyId: string) => {
    const confirmed = window.confirm('Revoke this key now?');
    if (!confirmed) return;

    startTransition(async () => {
      try {
        const response = await fetch(`/api/admin/service-accounts/${accountId}/keys/${keyId}`, {
          method: 'DELETE'
        });
        const payload = (await response.json()) as { error?: string };
        if (!response.ok) {
          setError(payload.error ?? 'Failed to revoke key.');
          return;
        }

        setSuccess('Key revoked immediately.');
        await loadAccounts();
      } catch {
        setError('Unexpected error while revoking key.');
      }
    });
  };

  const sortedAccounts = useMemo(
    () => [...accounts].sort((a, b) => a.displayName.localeCompare(b.displayName)),
    [accounts]
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Service accounts</h1>
        <p className="text-sm text-muted-foreground">Manage CI/CD bot identities with scoped API keys.</p>
      </div>

      <div className="rounded border p-4 space-y-3">
        <h2 className="text-lg font-semibold">Create service account</h2>
        <input
          className="w-full rounded border px-3 py-2 text-sm"
          placeholder="Display name"
          value={displayName}
          onChange={(event: ChangeEvent<HTMLInputElement>) => setDisplayName(event.target.value)}
          disabled={isPending}
        />
        <textarea
          className="w-full rounded border px-3 py-2 text-sm"
          placeholder="Description"
          value={description}
          onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setDescription(event.target.value)}
          disabled={isPending}
        />
        <input
          className="w-full rounded border px-3 py-2 text-sm"
          placeholder="Expiry days"
          value={expiresInDays}
          onChange={(event: ChangeEvent<HTMLInputElement>) => setExpiresInDays(event.target.value)}
          disabled={isPending}
        />

        <div className="flex flex-wrap gap-2 text-sm">
          {['skills:read', 'skills:publish', 'skills:admin'].map((scope) => (
            <label key={scope} className="inline-flex items-center gap-2 rounded border px-2 py-1">
              <input
                type="checkbox"
                checked={scopes.includes(scope)}
                onChange={() => toggleScope(scope)}
                disabled={isPending}
              />
              {scope}
            </label>
          ))}
        </div>

        <Button type="button" onClick={onCreateServiceAccount} disabled={isPending || displayName.trim().length < 3}>
          Create service account
        </Button>
      </div>

      {createdSecret ? (
        <div className="rounded border border-emerald-400 p-4 space-y-2">
          <p className="text-sm font-medium">Copy this secret now (shown once):</p>
          <code className="block overflow-x-auto rounded bg-muted px-2 py-1 text-xs">{createdSecret}</code>
          <Button type="button" variant="outline" onClick={() => navigator.clipboard.writeText(createdSecret)}>
            Copy
          </Button>
        </div>
      ) : null}

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {success ? <p className="text-sm text-emerald-600">{success}</p> : null}

      <div className="space-y-4">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : sortedAccounts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No service accounts yet.</p>
        ) : (
          sortedAccounts.map((account) => (
            <div key={account.id} className="rounded border p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="font-medium">{account.displayName}</p>
                  <p className="text-xs text-muted-foreground">
                    owner: {account.ownerName ?? account.ownerEmail ?? account.ownerUserId}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => onCreateKey(account.id, account.displayName)}
                    disabled={isPending || account.disabled}>
                    Create key
                  </Button>
                  <Button
                    type="button"
                    variant={account.disabled ? 'default' : 'destructive'}
                    onClick={() => onToggleDisabled(account.id, !account.disabled)}
                    disabled={isPending}>
                    {account.disabled ? 'Enable' : 'Disable'}
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                {account.keys.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No keys created.</p>
                ) : (
                  account.keys.map((key) => (
                    <div
                      key={key.id}
                      className="rounded border px-3 py-2 text-xs flex items-center justify-between gap-3">
                      <div className="space-y-1">
                        <p className="font-medium">
                          {key.name} ({key.start}...)
                        </p>
                        <p className="text-muted-foreground">
                          scopes: {key.scopes.length ? key.scopes.join(', ') : 'legacy-full'}
                        </p>
                        <p className="text-muted-foreground">
                          last used: {key.lastRequest ?? 'never'} | expires: {key.expiresAt ?? 'never'}
                        </p>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => onRevokeKey(account.id, key.id)}
                        disabled={isPending || !key.enabled}>
                        Revoke
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
