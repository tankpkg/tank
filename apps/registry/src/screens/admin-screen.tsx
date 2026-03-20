import { FileText, Package, Users } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { getAdminStatsFn } from '~/query/admin';

interface AdminStats {
  users: number;
  skills: number;
  auditEvents: number;
}

export function AdminScreen() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await getAdminStatsFn();
      setStats(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load stats');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const cards = [
    { title: 'Users', icon: Users, value: stats?.users ?? '--', description: 'Registered accounts' },
    { title: 'Packages', icon: Package, value: stats?.skills ?? '--', description: 'Published skills' },
    { title: 'Audit Logs', icon: FileText, value: stats?.auditEvents ?? '--', description: 'Recent events' }
  ] as const;

  return (
    <section className="tank-shell py-10 space-y-8">
      <div>
        <h1 className="text-3xl font-semibold">Admin Dashboard</h1>
        <p className="mt-1 text-ink-soft">System overview and management.</p>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
    </section>
  );
}
