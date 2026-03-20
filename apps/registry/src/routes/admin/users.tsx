import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { Search, ShieldAlert, ShieldOff } from 'lucide-react';
import { useState } from 'react';

import { Badge } from '~/components/ui/badge';
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
import { Label } from '~/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/components/ui/table';
import { formatDate } from '~/lib/format';
import { adminSetUserStatusFn, adminUpdateUserRoleFn, adminUsersFn } from '~/query/admin';

export const Route = createFileRoute('/admin/users')({
  component: AdminUsers
});

const roleOptions = ['all', 'user', 'admin'] as const;

function AdminUsers() {
  const queryClient = useQueryClient();
  const [q, setQ] = useState('');
  const [role, setRole] = useState<string>('all');
  const [page, setPage] = useState(1);

  const [banDialog, setBanDialog] = useState<{ userId: string; name: string } | null>(null);
  const [banReason, setBanReason] = useState('');
  const [banAction, setBanAction] = useState<'banned' | 'suspended'>('suspended');

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'users', { q, role, page }],
    queryFn: () => adminUsersFn({ data: { q: q || undefined, role, page, limit: 20 } })
  });

  const roleMutation = useMutation({
    mutationFn: (input: { userId: string; role: string }) => adminUpdateUserRoleFn({ data: input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })
  });

  const statusMutation = useMutation({
    mutationFn: (input: { userId: string; status: string; reason?: string }) => adminSetUserStatusFn({ data: input }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      setBanDialog(null);
      setBanReason('');
    }
  });

  const totalPages = data ? Math.ceil(data.total / data.limit) : 1;

  return (
    <section className="p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">User Management</h1>
        <p className="mt-1 text-sm text-muted-foreground">Manage user accounts, roles, and moderation.</p>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="Search users..."
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            className="pl-9"
          />
        </div>
        <select
          value={role}
          onChange={(e) => {
            setRole(e.target.value);
            setPage(1);
          }}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm">
          {roleOptions.map((r) => (
            <option key={r} value={r}>
              {r === 'all' ? 'All Roles' : r.charAt(0).toUpperCase() + r.slice(1)}
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
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">{u.name}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">{u.email}</TableCell>
                  <TableCell>
                    <select
                      value={u.role}
                      onChange={(e) => roleMutation.mutate({ userId: u.id, role: e.target.value })}
                      className="h-7 rounded border border-input bg-background px-2 text-xs">
                      <option value="user">User</option>
                      <option value="admin">Admin</option>
                    </select>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        u.status === 'active' ? 'secondary' : u.status === 'suspended' ? 'outline' : 'destructive'
                      }>
                      {u.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">{formatDate(u.createdAt)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      {u.status === 'active' ? (
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          title="Suspend/Ban user"
                          onClick={() => setBanDialog({ userId: u.id, name: u.name })}>
                          <ShieldAlert className="size-3.5 text-destructive" />
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          title="Restore user"
                          onClick={() => statusMutation.mutate({ userId: u.id, status: 'active' })}>
                          <ShieldOff className="size-3.5 text-green-600" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {data?.users.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    No users found.
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

      <Dialog open={!!banDialog} onOpenChange={(open) => !open && setBanDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Moderate User: {banDialog?.name}</DialogTitle>
            <DialogDescription>Choose an action and provide a reason.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Action</Label>
              <select
                value={banAction}
                onChange={(e) => setBanAction(e.target.value as 'banned' | 'suspended')}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="suspended">Suspend</option>
                <option value="banned">Ban</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label>Reason</Label>
              <Input
                placeholder="Reason for action..."
                value={banReason}
                onChange={(e) => setBanReason(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBanDialog(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={statusMutation.isPending}
              onClick={() => {
                if (!banDialog) return;
                statusMutation.mutate({
                  userId: banDialog.userId,
                  status: banAction,
                  reason: banReason || undefined
                });
              }}>
              {banAction === 'banned' ? 'Ban User' : 'Suspend User'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
