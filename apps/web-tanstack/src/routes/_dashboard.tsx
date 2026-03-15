import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';

import { ErrorFallback } from '~/components/error-fallback';
import { getSession } from '~/server-fns/session';

export const Route = createFileRoute('/_dashboard')({
  errorComponent: ErrorFallback,
  beforeLoad: async ({ location }) => {
    const session = await getSession();
    if (!session) {
      throw redirect({ to: '/login', search: { redirect: location.href } });
    }
    return { session };
  },
  component: DashboardLayout
});

function DashboardLayout() {
  return <Outlet />;
}
