import { useForm } from '@tanstack/react-form';
import { useCallback, useState } from 'react';
import { z } from 'zod';

import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/components/ui/table';
import { createTokenFn, listTokensFn, revokeTokenFn } from '~/server-fns/tokens';

const SCOPES = ['skills:read', 'skills:publish', 'skills:admin'] as const;

const EXPIRY_OPTIONS = [
  { label: '30 days', value: 30 },
  { label: '60 days', value: 60 },
  { label: '90 days', value: 90 },
  { label: '180 days', value: 180 },
  { label: '365 days', value: 365 }
] as const;

const tokenSchema = z.object({
  name: z.string().min(1, 'Token name is required').max(100, 'Token name must be 100 characters or fewer'),
  scopes: z.array(z.string()).min(1, 'Select at least one scope'),
  expiresInDays: z.number().min(1).max(365)
});

interface ApiKey {
  id: string;
  name: string | null;
  start: string | null;
  permissions: Record<string, unknown> | null;
  createdAt: Date;
  expiresAt: Date | null;
}

export function TokensScreen() {
  const [tokens, setTokens] = useState<ApiKey[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newKey, setNewKey] = useState<string | null>(null);

  const form = useForm({
    defaultValues: {
      name: '',
      scopes: ['skills:read'] as string[],
      expiresInDays: 90
    },
    onSubmit: async ({ value }) => {
      setCreating(true);
      setError(null);
      setNewKey(null);
      try {
        const result = await createTokenFn({
          data: {
            name: value.name.trim(),
            expiresInDays: value.expiresInDays,
            scopes: value.scopes
          }
        });
        if (result && 'key' in result) {
          setNewKey(result.key as string);
        }
        form.reset();
        await fetchTokens();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to create token');
      } finally {
        setCreating(false);
      }
    }
  });

  const fetchTokens = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await listTokensFn();
      const keys = (result as { apiKeys?: unknown[] })?.apiKeys ?? [];
      setTokens(keys as ApiKey[]);
      setLoaded(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load tokens');
    } finally {
      setLoading(false);
    }
  }, []);

  if (!loaded && !loading) {
    fetchTokens();
  }

  const handleRevoke = async (keyId: string) => {
    setRevokingId(keyId);
    setError(null);
    try {
      await revokeTokenFn({ data: { keyId } });
      await fetchTokens();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to revoke token');
    } finally {
      setRevokingId(null);
    }
  };

  const formatDate = (d: Date | string | null) => {
    if (!d) return '--';
    return new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  };

  return (
    <section className="tank-shell py-10 space-y-8">
      <div>
        <h1 className="text-3xl font-semibold">API Tokens</h1>
        <p className="mt-1 text-ink-soft">Manage API keys for CLI and programmatic access.</p>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {newKey && (
        <Card className="border-emerald-500/30 bg-emerald-500/5">
          <CardHeader>
            <CardTitle className="text-emerald-400">Token Created</CardTitle>
            <CardDescription>Copy this key now — it won't be shown again.</CardDescription>
          </CardHeader>
          <CardContent>
            <code className="block break-all rounded bg-muted px-3 py-2 text-sm font-mono">{newKey}</code>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Create Token</CardTitle>
          <CardDescription>Generate a new API key for CLI authentication.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              e.stopPropagation();

              const values = {
                name: form.getFieldValue('name'),
                scopes: form.getFieldValue('scopes'),
                expiresInDays: form.getFieldValue('expiresInDays')
              };
              const result = tokenSchema.safeParse(values);
              if (!result.success) {
                for (const issue of result.error.issues) {
                  const field = issue.path?.[0];
                  if (field && typeof field === 'string') {
                    form.setFieldMeta(field as 'name' | 'scopes' | 'expiresInDays', (prev) => ({
                      ...prev,
                      errorMap: { ...prev.errorMap, onChange: issue.message }
                    }));
                  }
                }
                return;
              }

              form.handleSubmit();
            }}
            className="space-y-4">
            <form.Field name="name">
              {(field) => (
                <div className="space-y-2">
                  <Label htmlFor="token-name">Name</Label>
                  <Input
                    id="token-name"
                    placeholder="e.g. CI/CD pipeline"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    onBlur={field.handleBlur}
                    maxLength={100}
                  />
                  {field.state.meta.errorMap.onChange && (
                    <p className="text-xs text-destructive">{field.state.meta.errorMap.onChange}</p>
                  )}
                </div>
              )}
            </form.Field>

            <form.Field name="scopes">
              {(field) => (
                <div className="space-y-2">
                  <Label>Scopes</Label>
                  <div className="flex flex-wrap gap-2">
                    {SCOPES.map((scope) => {
                      const selected = field.state.value.includes(scope);
                      return (
                        <button
                          key={scope}
                          type="button"
                          onClick={() => {
                            const current = field.state.value;
                            if (selected) {
                              if (current.length > 1) {
                                field.handleChange(current.filter((s) => s !== scope));
                              }
                            } else {
                              field.handleChange([...current, scope]);
                            }
                          }}
                          className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                            selected
                              ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-400'
                              : 'border-border text-muted-foreground hover:border-foreground/30'
                          }`}>
                          {scope}
                        </button>
                      );
                    })}
                  </div>
                  {field.state.meta.errorMap.onChange && (
                    <p className="text-xs text-destructive">{field.state.meta.errorMap.onChange}</p>
                  )}
                </div>
              )}
            </form.Field>

            <form.Field name="expiresInDays">
              {(field) => (
                <div className="space-y-2">
                  <Label htmlFor="token-expiry">Expiry</Label>
                  <select
                    id="token-expiry"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(Number(e.target.value))}
                    onBlur={field.handleBlur}
                    className="h-9 w-full max-w-[200px] rounded-md border border-input bg-transparent px-3 text-sm">
                    {EXPIRY_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </form.Field>

            <form.Subscribe selector={(state) => state.values.name}>
              {(name) => (
                <Button
                  type="submit"
                  disabled={creating || !name.trim()}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white">
                  {creating ? 'Creating...' : 'Create Token'}
                </Button>
              )}
            </form.Subscribe>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Active Tokens</CardTitle>
          <CardDescription>
            {tokens.length === 0 ? 'No API keys yet.' : `${tokens.length} key${tokens.length === 1 ? '' : 's'}`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading && !loaded ? (
            <p className="text-sm text-muted-foreground py-4">Loading...</p>
          ) : tokens.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Key Prefix</TableHead>
                  <TableHead>Scopes</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tokens.map((token) => {
                  const scopes = token.permissions
                    ? ((token.permissions as Record<string, string[]>).skills ?? [])
                    : [];
                  return (
                    <TableRow key={token.id}>
                      <TableCell className="font-medium">{token.name ?? 'Unnamed'}</TableCell>
                      <TableCell>
                        <code className="text-xs text-muted-foreground">{token.start ?? '--'}...</code>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {scopes.map((s: string) => (
                            <Badge key={s} variant="secondary" className="text-[10px]">
                              {s}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">{formatDate(token.createdAt)}</TableCell>
                      <TableCell className="text-muted-foreground text-xs">{formatDate(token.expiresAt)}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="destructive"
                          size="sm"
                          disabled={revokingId === token.id}
                          onClick={() => handleRevoke(token.id)}>
                          {revokingId === token.id ? 'Revoking...' : 'Revoke'}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : null}
        </CardContent>
      </Card>
    </section>
  );
}
