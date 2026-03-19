import { createFileRoute } from '@tanstack/react-router';
import { useCallback, useEffect, useState } from 'react';

import { Button } from '~/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { Input } from '~/components/ui/input';

interface PackageRow {
  id: string;
  name: string;
  description: string | null;
  status: string;
  visibility: string;
  featured: boolean;
  publisherName: string | null;
  publisherEmail: string | null;
  versionCount: number;
  downloadCount: number;
  createdAt: string;
}

interface PackagesResponse {
  packages: PackageRow[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export const Route = createFileRoute('/admin/packages')({
  component: AdminPackagesPage
});

function AdminPackagesPage() {
  const [data, setData] = useState<PackagesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchPackages = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: '20' });
    if (search) params.set('search', search);
    if (statusFilter) params.set('status', statusFilter);
    const res = await fetch(`/api/admin/packages?${params}`, { credentials: 'include' });
    if (res.ok) setData(await res.json());
    setLoading(false);
  }, [page, search, statusFilter]);

  useEffect(() => {
    fetchPackages();
  }, [fetchPackages]);

  const updateStatus = async (name: string, status: string) => {
    setActionLoading(name);
    await fetch(`/api/admin/packages/${name}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ status })
    });
    setActionLoading(null);
    fetchPackages();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Packages</CardTitle>
        <div className="flex gap-2 mt-2">
          <Input
            placeholder="Search packages..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="max-w-xs"
          />
          <select
            className="h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}>
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="deprecated">Deprecated</option>
            <option value="quarantined">Quarantined</option>
            <option value="removed">Removed</option>
          </select>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-muted-foreground text-sm">Loading...</p>
        ) : !data?.packages.length ? (
          <p className="text-muted-foreground text-sm">No packages found.</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-2 pr-4">Name</th>
                    <th className="pb-2 pr-4">Publisher</th>
                    <th className="pb-2 pr-4">Status</th>
                    <th className="pb-2 pr-4">Versions</th>
                    <th className="pb-2 pr-4">Downloads</th>
                    <th className="pb-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.packages.map((pkg) => (
                    <tr key={pkg.id} className="border-b last:border-0">
                      <td className="py-2 pr-4 font-mono text-xs">{pkg.name}</td>
                      <td className="py-2 pr-4 text-muted-foreground">
                        {pkg.publisherName || pkg.publisherEmail || '—'}
                      </td>
                      <td className="py-2 pr-4">
                        <PkgStatusBadge status={pkg.status} />
                      </td>
                      <td className="py-2 pr-4">{pkg.versionCount}</td>
                      <td className="py-2 pr-4">{pkg.downloadCount.toLocaleString()}</td>
                      <td className="py-2">
                        <select
                          className="h-7 rounded border border-input bg-transparent px-2 text-xs"
                          value=""
                          disabled={actionLoading === pkg.name}
                          onChange={(e) => {
                            if (e.target.value) updateStatus(pkg.name, e.target.value);
                          }}>
                          <option value="">Change status...</option>
                          {['active', 'deprecated', 'quarantined', 'removed']
                            .filter((s) => s !== pkg.status)
                            .map((s) => (
                              <option key={s} value={s}>
                                {s}
                              </option>
                            ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between mt-4 text-sm text-muted-foreground">
              <span>{data.total} total packages</span>
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

function PkgStatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    active: 'bg-emerald-500/10 text-emerald-500',
    deprecated: 'bg-amber-500/10 text-amber-500',
    quarantined: 'bg-red-500/10 text-red-500',
    removed: 'bg-red-500/10 text-red-400'
  };
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium ${colors[status] || 'bg-muted text-muted-foreground'}`}>
      {status}
    </span>
  );
}
