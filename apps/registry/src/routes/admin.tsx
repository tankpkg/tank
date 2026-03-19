import { createFileRoute, Link, Outlet, redirect } from '@tanstack/react-router';

import { ErrorFallback } from '~/components/error-fallback';
import { getAdminSession } from '~/lib/auth/session';
import { getAdminStatsFn } from '~/query/admin';

const tabs = [
  { label: 'Overview', to: '/admin' },
  { label: 'Users', to: '/admin/users' },
  { label: 'Packages', to: '/admin/packages' },
  { label: 'Audit Logs', to: '/admin/audit-logs' }
];

export const Route = createFileRoute('/admin')({
  errorComponent: ErrorFallback,
  beforeLoad: async ({ location }) => {
    const session = await getAdminSession();
    if (!session) throw redirect({ to: '/login', search: { redirect: location.href } });
    return { session };
  },
  loader: () => getAdminStatsFn(),
  component: AdminLayout
});

function AdminLayout() {
  return (
    <section className="tank-shell py-10 space-y-8">
      <div>
        <h1 className="text-3xl font-semibold">Admin Dashboard</h1>
        <p className="mt-1 text-ink-soft">System overview and management.</p>
      </div>

      <nav className="flex gap-1 border-b">
        {tabs.map((tab) => (
          <Link
            key={tab.to}
            to={tab.to}
            activeOptions={{ exact: tab.to === '/admin' }}
            className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors border-b-2 border-transparent [&.active]:border-primary [&.active]:text-foreground">
            {tab.label}
          </Link>
        ))}
      </nav>

      <Outlet />
    </section>
  );
}
