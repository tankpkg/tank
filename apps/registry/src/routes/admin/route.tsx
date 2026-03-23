import { createFileRoute, Link, Outlet, redirect, useNavigate } from '@tanstack/react-router';
import {
  Bot,
  Building2,
  FileText,
  LayoutDashboard,
  LogOut,
  type LucideIcon,
  Package,
  Settings,
  Users
} from 'lucide-react';

import { ErrorFallback } from '~/components/error-fallback';
import { Button } from '~/components/ui/button';
import { authClient } from '~/lib/auth/client';
import { getAdminSession } from '~/lib/auth/session';

export const Route = createFileRoute('/admin')({
  errorComponent: ErrorFallback,
  beforeLoad: async ({ location }) => {
    const session = await getAdminSession();
    if (!session) throw redirect({ to: '/login', search: { redirect: location.href } });
    return { session };
  },
  loader: async () => ({}),
  component: AdminLayout
});

interface SidebarItem {
  to: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
}

const baseSidebarItems: SidebarItem[] = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { to: '/admin/users', label: 'Users', icon: Users },
  { to: '/admin/packages', label: 'Packages', icon: Package },
  { to: '/admin/orgs', label: 'Organizations', icon: Building2 },
  { to: '/admin/service-accounts', label: 'Service Accounts', icon: Bot },
  { to: '/admin/audit-logs', label: 'Audit Logs', icon: FileText }
];

function AdminLayout() {
  const { session } = Route.useRouteContext();

  const sidebarItems = [...baseSidebarItems, { to: '/admin/settings', label: 'Settings', icon: Settings }];
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await authClient.signOut();
    navigate({ to: '/' });
  };

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)]">
      <aside className="sticky top-14 flex h-[calc(100vh-3.5rem)] w-64 shrink-0 flex-col border-r border-border bg-background">
        <div className="border-b border-border px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Admin</p>
        </div>

        <nav className="flex-1 space-y-1 p-4">
          {sidebarItems.map((item) => (
            <Link
              key={item.label}
              to={item.to}
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
