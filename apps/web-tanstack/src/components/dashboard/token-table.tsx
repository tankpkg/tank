import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/components/ui/table';

export interface ApiKey {
  id: string;
  name: string | null;
  start: string | null;
  permissions: Record<string, unknown> | null;
  createdAt: Date;
  expiresAt: Date | null;
}

interface TokenTableProps {
  tokens: ApiKey[];
  loading: boolean;
  loaded: boolean;
  onRevoke: (keyId: string) => void;
  revokingId: string | null;
}

function formatDate(d: Date | string | null) {
  if (!d) return '--';
  return new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function TokenTable({ tokens, loading, loaded, onRevoke, revokingId }: TokenTableProps) {
  return (
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
                const scopes = token.permissions ? ((token.permissions as Record<string, string[]>).skills ?? []) : [];
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
                        onClick={() => onRevoke(token.id)}>
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
  );
}
