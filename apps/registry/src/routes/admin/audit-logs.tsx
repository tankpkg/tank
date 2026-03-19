import { createFileRoute } from '@tanstack/react-router';
import { useCallback, useEffect, useState } from 'react';

import { Button } from '~/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { Input } from '~/components/ui/input';

interface AuditEvent {
  id: string;
  action: string;
  actorId: string | null;
  actorName: string | null;
  actorEmail: string | null;
  targetType: string | null;
  targetId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

interface AuditResponse {
  events: AuditEvent[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export const Route = createFileRoute('/admin/audit-logs')({
  component: AdminAuditLogsPage
});

function AdminAuditLogsPage() {
  const [data, setData] = useState<AuditResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState('');
  const [page, setPage] = useState(1);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: '30' });
    if (actionFilter) params.set('action', actionFilter);
    const res = await fetch(`/api/admin/audit-logs?${params}`, { credentials: 'include' });
    if (res.ok) setData(await res.json());
    setLoading(false);
  }, [page, actionFilter]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Audit Logs</CardTitle>
        <div className="flex gap-2 mt-2">
          <Input
            placeholder="Filter by action (e.g. api_key.create)..."
            value={actionFilter}
            onChange={(e) => {
              setActionFilter(e.target.value);
              setPage(1);
            }}
            className="max-w-xs"
          />
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-muted-foreground text-sm">Loading...</p>
        ) : !data?.events.length ? (
          <p className="text-muted-foreground text-sm">No audit events found.</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-2 pr-4">Time</th>
                    <th className="pb-2 pr-4">Action</th>
                    <th className="pb-2 pr-4">Actor</th>
                    <th className="pb-2 pr-4">Target</th>
                    <th className="pb-2">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {data.events.map((evt) => (
                    <tr key={evt.id} className="border-b last:border-0">
                      <td className="py-2 pr-4 text-muted-foreground whitespace-nowrap">
                        {new Date(evt.createdAt).toLocaleString()}
                      </td>
                      <td className="py-2 pr-4">
                        <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">{evt.action}</span>
                      </td>
                      <td className="py-2 pr-4">{evt.actorName || evt.actorEmail || evt.actorId || 'system'}</td>
                      <td className="py-2 pr-4 text-muted-foreground">
                        {evt.targetType && (
                          <span className="font-mono text-xs">
                            {evt.targetType}/{evt.targetId?.slice(0, 8)}
                          </span>
                        )}
                      </td>
                      <td className="py-2 text-xs text-muted-foreground max-w-[200px] truncate">
                        {evt.metadata ? JSON.stringify(evt.metadata) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between mt-4 text-sm text-muted-foreground">
              <span>{data.total} total events</span>
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
