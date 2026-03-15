import { createFileRoute } from '@tanstack/react-router';
import { FileText, Package, Users } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';

export const Route = createFileRoute('/_admin/admin')({
  component: AdminPage
});

const adminCards = [
  { title: 'Users', icon: Users, value: '--', description: 'Registered accounts' },
  { title: 'Packages', icon: Package, value: '--', description: 'Published skills' },
  { title: 'Audit Logs', icon: FileText, value: '--', description: 'Recent events' }
] as const;

function AdminPage() {
  return (
    <section className="tank-shell py-10 space-y-8">
      <div>
        <h1 className="text-3xl font-semibold">Admin Dashboard</h1>
        <p className="mt-1 text-ink-soft">System overview and management.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {adminCards.map((card) => (
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
