import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';

import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/components/ui/table';
import { formatDate } from '~/lib/format';
import { adminAuditLogsFn } from '~/query/admin';

export const Route = createFileRoute('/admin/audit-logs')({
  component: AdminAuditLogs
});

const actionTypes = [
  'all',
  'skill.publish',
  'skill.delete',
  'skill.scan',
  'user.login',
  'user.ban',
  'user.role_change',
  'org.create',
  'org.invite',
  'apikey.create',
  'apikey.revoke'
] as const;

function AdminAuditLogs() {
  const [action, setAction] = useState<string>('all');
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'audit-logs', { action, page }],
    queryFn: () => adminAuditLogsFn({ data: { action, page, limit: 30 } })
  });

  const totalPages = data ? Math.ceil(data.total / data.limit) : 1;

  return (
    <section className="p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Audit Logs</h1>
        <p className="mt-1 text-sm text-muted-foreground">System event history and audit trail.</p>
      </div>

      <div className="flex items-center gap-3">
        <select
          value={action}
          onChange={(e) => {
            setAction(e.target.value);
            setPage(1);
          }}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm">
          {actionTypes.map((a) => (
            <option key={a} value={a}>
              {a === 'all' ? 'All Actions' : a}
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
                <TableHead>Time</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Target</TableHead>
                <TableHead>Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.events.map((event) => (
                <TableRow key={event.id}>
                  <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
                    {formatDate(event.createdAt)}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="font-mono text-xs">
                      {event.action}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">{event.actorName}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {event.targetType ? (
                      <span>
                        <span className="text-xs uppercase">{event.targetType}</span>
                        {event.targetId && (
                          <span className="font-mono text-xs ml-1">:{event.targetId.slice(0, 8)}</span>
                        )}
                      </span>
                    ) : (
                      '--'
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                    {event.metadata ?? '--'}
                  </TableCell>
                </TableRow>
              ))}
              {data?.events.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    No audit events found.
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
