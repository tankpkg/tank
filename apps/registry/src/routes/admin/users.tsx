import { createFileRoute } from '@tanstack/react-router';
import { useCallback, useEffect, useState } from 'react';

import { Button } from '~/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { Input } from '~/components/ui/input';

interface UserRow {
  id: string;
  name: string | null;
  email: string;
  role: string;
  emailVerified: boolean;
  createdAt: string;
  status: string | null;
  statusReason: string | null;
}

interface UsersResponse {
  users: UserRow[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export const Route = createFileRoute('/admin/users')({
  component: AdminUsersPage
});

function AdminUsersPage() {
  const [data, setData] = useState<UsersResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: '20' });
    if (search) params.set('search', search);
    const res = await fetch(`/api/admin/users?${params}`, { credentials: 'include' });
    if (res.ok) setData(await res.json());
    setLoading(false);
  }, [page, search]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const updateStatus = async (userId: string, status: string, reason?: string) => {
    setActionLoading(userId);
    await fetch(`/api/admin/users/${userId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ status, reason })
    });
    setActionLoading(null);
    fetchUsers();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Users</CardTitle>
        <div className="flex gap-2 mt-2">
          <Input
            placeholder="Search by name or email..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="max-w-xs"
          />
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-muted-foreground text-sm">Loading...</p>
        ) : !data?.users.length ? (
          <p className="text-muted-foreground text-sm">No users found.</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-2 pr-4">Name</th>
                    <th className="pb-2 pr-4">Email</th>
                    <th className="pb-2 pr-4">Role</th>
                    <th className="pb-2 pr-4">Status</th>
                    <th className="pb-2 pr-4">Joined</th>
                    <th className="pb-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.users.map((u) => (
                    <tr key={u.id} className="border-b last:border-0">
                      <td className="py-2 pr-4">{u.name || '—'}</td>
                      <td className="py-2 pr-4 font-mono text-xs">{u.email}</td>
                      <td className="py-2 pr-4">
                        <span className={u.role === 'admin' ? 'text-primary font-medium' : ''}>{u.role}</span>
                      </td>
                      <td className="py-2 pr-4">
                        <StatusBadge status={u.status ?? 'active'} />
                      </td>
                      <td className="py-2 pr-4 text-muted-foreground">{new Date(u.createdAt).toLocaleDateString()}</td>
                      <td className="py-2">
                        {(u.status ?? 'active') === 'active' ? (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={actionLoading === u.id}
                            onClick={() => updateStatus(u.id, 'suspended', 'Admin action')}>
                            Suspend
                          </Button>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={actionLoading === u.id}
                            onClick={() => updateStatus(u.id, 'active')}>
                            Activate
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between mt-4 text-sm text-muted-foreground">
              <span>{data.total} total users</span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  Previous
                </Button>
                <span className="py-1">
                  Page {data.page} of {data.totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= data.totalPages}
                  onClick={() => setPage((p) => p + 1)}>
                  Next
                </Button>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    active: 'bg-emerald-500/10 text-emerald-500',
    suspended: 'bg-amber-500/10 text-amber-500',
    banned: 'bg-red-500/10 text-red-500'
  };
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium ${colors[status] || 'bg-muted text-muted-foreground'}`}>
      {status}
    </span>
  );
}
