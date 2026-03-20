import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { Bot, Search } from 'lucide-react';
import { useState } from 'react';

import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/components/ui/table';
import { formatDate } from '~/lib/format';
import { adminServiceAccountsFn, adminToggleServiceAccountFn } from '~/query/admin';

export const Route = createFileRoute('/admin/service-accounts')({
  component: AdminServiceAccounts
});

function AdminServiceAccounts() {
  const queryClient = useQueryClient();
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'service-accounts', { q, page }],
    queryFn: () => adminServiceAccountsFn({ data: { q: q || undefined, page, limit: 20 } })
  });

  const toggleMutation = useMutation({
    mutationFn: (input: { accountId: string; disabled: boolean }) => adminToggleServiceAccountFn({ data: input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'service-accounts'] })
  });

  const totalPages = data ? Math.ceil(data.total / data.limit) : 1;

  return (
    <section className="p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Service Accounts</h1>
        <p className="mt-1 text-sm text-muted-foreground">Manage service accounts and their API access.</p>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="Search service accounts..."
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            className="pl-9"
          />
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Display Name</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>API Keys</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.accounts.map((sa) => (
                <TableRow key={sa.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Bot className="size-4 text-muted-foreground" />
                      <div>
                        <p className="font-medium text-sm">{sa.displayName}</p>
                        {sa.description && (
                          <p className="text-xs text-muted-foreground truncate max-w-[200px]">{sa.description}</p>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{sa.ownerName}</TableCell>
                  <TableCell>
                    <Badge variant={sa.disabled ? 'destructive' : 'secondary'}>
                      {sa.disabled ? 'Disabled' : 'Active'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">{sa.apiKeyCount}</TableCell>
                  <TableCell className="text-muted-foreground text-xs">{formatDate(sa.createdAt)}</TableCell>
                  <TableCell>
                    <Button
                      variant="outline"
                      size="xs"
                      onClick={() => toggleMutation.mutate({ accountId: sa.id, disabled: !sa.disabled })}>
                      {sa.disabled ? 'Enable' : 'Disable'}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {data?.accounts.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    No service accounts found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>

          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                Page {page} of {totalPages} ({data?.total} total)
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                  Previous
                </Button>
                <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
