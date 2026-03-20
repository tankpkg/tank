import { queryOptions, useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { AlertTriangle, FileText, Package, Users } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/components/ui/table';
import { formatDate } from '~/lib/format';
import { adminStatsFn } from '~/query/admin';

function adminStatsQueryOptions() {
  return queryOptions({
    queryKey: ['admin', 'stats'],
    queryFn: () => adminStatsFn()
  });
}

export const Route = createFileRoute('/admin/')({
  loader: ({ context }) => context.queryClient?.ensureQueryData(adminStatsQueryOptions()),
  component: AdminDashboard
});

function AdminDashboard() {
  const { data } = useQuery(adminStatsQueryOptions());

  const cards = [
    { title: 'Users', icon: Users, value: data?.userCount ?? 0, description: 'Registered accounts' },
    { title: 'Packages', icon: Package, value: data?.skillCount ?? 0, description: 'Published skills' },
    {
      title: 'Flagged',
      icon: AlertTriangle,
      value: data?.flaggedCount ?? 0,
      description: 'Non-active packages'
    },
    {
      title: 'Audit Events',
      icon: FileText,
      value: data?.recentEvents?.length ?? 0,
      description: 'Recent events shown'
    }
  ];

  return (
    <section className="p-8 space-y-8">
      <div>
        <h1 className="text-3xl font-semibold">Admin Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">System overview and management.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((card) => (
          <Card key={card.title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{card.title}</CardTitle>
              <card.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{card.value}</div>
              <p className="text-xs text-muted-foreground mt-1">{card.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-4">Recent Audit Events</h2>
        {data?.recentEvents && data.recentEvents.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Target</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.recentEvents.map((event) => (
                <TableRow key={event.id}>
                  <TableCell className="text-muted-foreground text-xs">{formatDate(event.createdAt)}</TableCell>
                  <TableCell className="font-mono text-xs">{event.action}</TableCell>
                  <TableCell className="text-sm">{event.actorId ?? 'System'}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {event.targetType ? `${event.targetType}:${event.targetId}` : '--'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <p className="text-sm text-muted-foreground">No recent events.</p>
        )}
      </div>
    </section>
  );
}
