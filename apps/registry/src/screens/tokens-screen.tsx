import { useCallback, useState } from 'react';
import { TokenForm } from '~/components/dashboard/token-form';
import type { ApiKey } from '~/components/dashboard/token-table';
import { TokenTable } from '~/components/dashboard/token-table';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card';
import { listTokensFn, revokeTokenFn } from '~/lib/auth/tokens';

export function TokensScreen() {
  const [tokens, setTokens] = useState<ApiKey[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newKey, setNewKey] = useState<string | null>(null);

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
        <Card className="border-tank/30 bg-tank/5">
          <CardHeader>
            <CardTitle className="text-tank">Token Created</CardTitle>
            <CardDescription>Copy this key now — it won't be shown again.</CardDescription>
          </CardHeader>
          <CardContent>
            <code className="block break-all rounded bg-muted px-3 py-2 text-sm font-mono">{newKey}</code>
          </CardContent>
        </Card>
      )}

      <TokenForm onTokenCreated={(key) => setNewKey(key)} onError={(msg) => setError(msg)} onRefresh={fetchTokens} />

      <TokenTable tokens={tokens} loading={loading} loaded={loaded} onRevoke={handleRevoke} revokingId={revokingId} />
    </section>
  );
}
