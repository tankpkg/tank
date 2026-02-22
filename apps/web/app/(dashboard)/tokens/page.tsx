'use client';

import { useEffect, useState, useCallback, type ChangeEvent, type KeyboardEvent } from 'react';
import { createToken, listTokens, revokeToken } from './actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

interface ApiKeyItem {
  id: string;
  name: string | null;
  start: string | null;
  prefix: string | null;
  createdAt: Date;
  lastRequest: Date | null;
  expiresAt: Date | null;
  enabled: boolean;
  permissions?: string | null;
}

export default function TokensPage() {
  const [tokens, setTokens] = useState<ApiKeyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [tokenName, setTokenName] = useState('');
  const [expiresInDays, setExpiresInDays] = useState('90');
  const [scopes, setScopes] = useState<string[]>(['skills:read']);
  const [creating, setCreating] = useState(false);
  const [newTokenValue, setNewTokenValue] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const loadTokens = useCallback(async () => {
    try {
      const keys = await listTokens();
      setTokens(keys as ApiKeyItem[]);
    } catch {
      // User may not be authenticated — layout handles redirect
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTokens();
  }, [loadTokens]);

  const handleCreate = async () => {
    if (!tokenName.trim()) return;
    setCreating(true);
    try {
      const result = await createToken({
        name: tokenName.trim(),
        expiresInDays: Number(expiresInDays) || 90,
        scopes,
      });
      // result contains the full key value on creation
      setNewTokenValue((result as { key: string }).key);
      setTokenName('');
      setExpiresInDays('90');
      setScopes(['skills:read']);
      await loadTokens();
    } catch (err) {
      console.error('Failed to create token:', err);
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (keyId: string) => {
    setRevokingId(keyId);
    try {
      await revokeToken(keyId);
      await loadTokens();
    } catch (err) {
      console.error('Failed to revoke token:', err);
    } finally {
      setRevokingId(null);
    }
  };

  const handleCopy = async () => {
    if (newTokenValue) {
      await navigator.clipboard.writeText(newTokenValue);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleCloseNewToken = () => {
    setNewTokenValue(null);
    setCreateOpen(false);
    setCopied(false);
    setExpiresInDays('90');
    setScopes(['skills:read']);
  };

  const toggleScope = (scope: string) => {
    setScopes((current: string[]) => {
      if (current.includes(scope)) {
        const next = current.filter((s: string) => s !== scope);
        return next.length === 0 ? ['skills:read'] : next;
      }
      return [...current, scope];
    });
  };

  const parseScopes = (raw: string | null | undefined) => {
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') as string[] : [];
    } catch {
      return [];
    }
  };

  const formatDate = (date: Date | string | null) => {
    if (!date) return 'Never';
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const getDisplayKey = (token: ApiKeyItem) => {
    if (token.start) return `${token.start}...`;
    if (token.prefix) return `${token.prefix}...`;
    return 'tank_...';
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">API Tokens</h1>
          <p className="text-muted-foreground mt-1">
            Create and manage API keys for CLI and programmatic access.
          </p>
        </div>

        <Dialog open={createOpen} onOpenChange={(open: boolean) => {
          setCreateOpen(open);
          if (!open) {
            setNewTokenValue(null);
            setCopied(false);
            setTokenName('');
          }
        }}>
          <DialogTrigger asChild>
            <Button>Create New Token</Button>
          </DialogTrigger>
          <DialogContent>
            {newTokenValue ? (
              <>
                <DialogHeader>
                  <DialogTitle>Token Created</DialogTitle>
                  <DialogDescription>
                    Copy your token now. You won&apos;t be able to see it again.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <code className="flex-1 rounded-md bg-muted px-3 py-2 text-sm font-mono break-all">
                      {newTokenValue}
                    </code>
                  </div>
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={handleCopy}
                  >
                    {copied ? 'Copied!' : 'Copy to clipboard'}
                  </Button>
                </div>
                <DialogFooter>
                  <Button onClick={handleCloseNewToken}>Done</Button>
                </DialogFooter>
              </>
            ) : (
              <>
                <DialogHeader>
                  <DialogTitle>Create New Token</DialogTitle>
                  <DialogDescription>
                    Create a scoped token for your workflows.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-2">
                  <div className="space-y-2">
                    <Label htmlFor="token-name">Token name</Label>
                    <Input
                      id="token-name"
                      placeholder="e.g. CI/CD Pipeline"
                      value={tokenName}
                      onChange={(e: ChangeEvent<HTMLInputElement>) => setTokenName(e.target.value)}
                      onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
                        if (e.key === 'Enter') handleCreate();
                      }}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="token-expiry">Expires in (days)</Label>
                    <Input
                      id="token-expiry"
                      type="number"
                      min={1}
                      max={365}
                      value={expiresInDays}
                      onChange={(e: ChangeEvent<HTMLInputElement>) => setExpiresInDays(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Scopes</Label>
                    <div className="flex flex-wrap gap-2 text-sm">
                      {['skills:read', 'skills:publish', 'skills:admin'].map((scope) => (
                        <label key={scope} className="inline-flex items-center gap-2 rounded border px-2 py-1">
                          <input
                            type="checkbox"
                            checked={scopes.includes(scope)}
                            onChange={() => toggleScope(scope)}
                          />
                          {scope}
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => setCreateOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleCreate}
                    disabled={creating || !tokenName.trim()}
                  >
                    {creating ? 'Creating...' : 'Create'}
                  </Button>
                </DialogFooter>
              </>
            )}
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="text-muted-foreground text-sm py-8 text-center">
          Loading tokens...
        </div>
      ) : tokens.length === 0 ? (
        <div className="text-center py-12 border rounded-lg">
          <p className="text-muted-foreground">No API tokens yet.</p>
          <p className="text-muted-foreground text-sm mt-1">
            Create a token to authenticate with the Tank CLI.
          </p>
        </div>
      ) : (
        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Key</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Last Used</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead>Scopes</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
            <TableBody>
              {tokens.map((token) => (
                <TableRow key={token.id}>
                  <TableCell className="font-medium">
                    {token.name || 'Unnamed'}
                  </TableCell>
                  <TableCell>
                    <code className="text-sm bg-muted px-2 py-0.5 rounded">
                      {getDisplayKey(token)}
                    </code>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {formatDate(token.createdAt)}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {formatDate(token.lastRequest)}
                  </TableCell>
                  <TableCell>
                    {token.expiresAt ? (
                      <Badge variant={new Date(token.expiresAt) < new Date() ? 'destructive' : 'secondary'}>
                        {formatDate(token.expiresAt)}
                      </Badge>
                    ) : (
                      <Badge variant="secondary">Never</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {(() => {
                      const tokenScopes = parseScopes(token.permissions);
                      return tokenScopes.length > 0 ? tokenScopes.join(', ') : 'legacy-full';
                    })()}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleRevoke(token.id)}
                      disabled={revokingId === token.id}
                    >
                      {revokingId === token.id ? 'Revoking...' : 'Revoke'}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
