import { createFileRoute, Link, Outlet, redirect, useNavigate } from '@tanstack/react-router';
import { Building2, FileText, Home, Key, LogOut, type LucideIcon } from 'lucide-react';

import { ErrorFallback } from '~/components/error-fallback';
import { Button } from '~/components/ui/button';
import { authClient } from '~/lib/auth/client';
import { getSession } from '~/lib/auth/session';

export const Route = createFileRoute('/dashboard')({
  errorComponent: ErrorFallback,
  beforeLoad: async ({ location }) => {
    const session = await getSession();
    if (!session) throw redirect({ to: '/login', search: { redirect: location.href } });
    return { session };
  },
  component: DashboardLayout
});

interface SidebarItem {
  to: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
  params?: Record<string, string>;
}

const sidebarItems: SidebarItem[] = [
  { to: '/dashboard', label: 'Dashboard', icon: Home, exact: true },
  { to: '/dashboard/tokens', label: 'Tokens', icon: Key },
  { to: '/dashboard/orgs', label: 'Organizations', icon: Building2 },
  { to: '/docs/$', label: 'Docs', icon: FileText, params: { _splat: '' } }
];

function DashboardLayout() {
  const { session } = Route.useRouteContext();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await authClient.signOut();
    navigate({ to: '/' });
  };

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)]">
      <aside className="sticky top-14 flex h-[calc(100vh-3.5rem)] w-64 shrink-0 flex-col border-r border-border bg-background">
        <nav className="flex-1 space-y-1 p-4">
          {sidebarItems.map((item) => (
            <Link
              key={item.label}
              to={item.to}
              params={item.params}
              activeOptions={{ exact: item.exact ?? false }}
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground [&.active]:bg-muted [&.active]:text-foreground">
              <item.icon className="size-4" />
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="border-t border-border p-4">
          <div className="mb-3">
            <p className="text-sm font-medium truncate">{session.user.name}</p>
            <p className="text-xs text-muted-foreground truncate">{session.user.email}</p>
          </div>
          <Button variant="ghost" size="sm" className="w-full justify-start gap-2" onClick={handleSignOut}>
            <LogOut className="size-4" />
            Sign out
          </Button>
        </div>
      </aside>

      <div className="flex-1 overflow-auto">
        <Outlet />
      </div>
    </div>
  );
}
