import { createFileRoute, Link } from '@tanstack/react-router';
import { Building2, Key, Search } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';

export const Route = createFileRoute('/dashboard/')({
  component: DashboardHome
});

const cards = [
  { to: '/dashboard/tokens', label: 'Manage Tokens', description: 'Create and revoke API keys', icon: Key },
  {
    to: '/dashboard/orgs',
    label: 'Manage Organizations',
    description: 'View and manage your organizations',
    icon: Building2
  },
  { to: '/skills', label: 'Browse Skills', description: 'Discover and install AI agent skills', icon: Search }
] as const;

function DashboardHome() {
  const { session } = Route.useRouteContext();

  return (
    <section className="p-8 space-y-8">
      <h1 className="text-3xl font-semibold">Welcome back, {session.user.name || 'there'}</h1>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => (
          <Link key={card.label} to={card.to} search={{} as never}>
            <Card className="transition-colors hover:border-foreground/20 cursor-pointer">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <card.icon className="size-5" />
                  {card.label}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{card.description}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </section>
  );
}
