import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { Search, Star, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { Button } from '~/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '~/components/ui/dialog';
import { Input } from '~/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/components/ui/table';
import { formatDate } from '~/lib/format';
import { adminDeletePackageFn, adminPackagesFn, adminUpdatePackageFn } from '~/query/admin';

export const Route = createFileRoute('/admin/packages')({
  component: AdminPackages
});

const statusOptions = ['all', 'active', 'suspended', 'removed'] as const;

function AdminPackages() {
  const queryClient = useQueryClient();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<string>('all');
  const [page, setPage] = useState(1);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'packages', { q, status, page }],
    queryFn: () => adminPackagesFn({ data: { q: q || undefined, status, page, limit: 20 } })
  });

  const updateMutation = useMutation({
    mutationFn: (input: { skillId: string; status?: string; featured?: boolean }) =>
      adminUpdatePackageFn({ data: input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'packages'] })
  });

  const deleteMutation = useMutation({
    mutationFn: (input: { skillId: string }) => adminDeletePackageFn({ data: input }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'packages'] });
      setDeleteTarget(null);
    }
  });

  const totalPages = data ? Math.ceil(data.total / data.limit) : 1;

  return (
    <section className="p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Package Management</h1>
        <p className="mt-1 text-sm text-muted-foreground">Manage published skills, moderation, and featuring.</p>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="Search packages..."
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            className="pl-9"
          />
        </div>
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm">
          {statusOptions.map((s) => (
            <option key={s} value={s}>
              {s === 'all' ? 'All Statuses' : s.charAt(0).toUpperCase() + s.slice(1)}
            </option>
          ))}
        </select>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Publisher</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Featured</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.packages.map((pkg) => (
                <TableRow key={pkg.id}>
                  <TableCell className="font-mono text-sm font-medium">{pkg.name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{pkg.publisherName}</TableCell>
                  <TableCell>
                    <select
                      value={pkg.status}
                      onChange={(e) => updateMutation.mutate({ skillId: pkg.id, status: e.target.value })}
                      className="h-7 rounded border border-input bg-background px-2 text-xs">
                      <option value="active">Active</option>
                      <option value="suspended">Suspended</option>
                      <option value="removed">Removed</option>
                    </select>
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      title={pkg.featured ? 'Unfeature' : 'Feature'}
                      onClick={() => updateMutation.mutate({ skillId: pkg.id, featured: !pkg.featured })}>
                      <Star
                        className={`size-3.5 ${pkg.featured ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground'}`}
                      />
                    </Button>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">{formatDate(pkg.updatedAt)}</TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      title="Delete package"
                      onClick={() => setDeleteTarget({ id: pkg.id, name: pkg.name })}>
                      <Trash2 className="size-3.5 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {data?.packages.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    No packages found.
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

      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Package</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <strong className="font-mono">{deleteTarget?.name}</strong>? This action
              cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={() => {
                if (!deleteTarget) return;
                deleteMutation.mutate({ skillId: deleteTarget.id });
              }}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
