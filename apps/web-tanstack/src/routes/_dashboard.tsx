import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';

import { ErrorFallback } from '~/components/error-fallback';
import { getSession } from '~/server-fns/auth';

export const Route = createFileRoute('/_dashboard')({
  errorComponent: ErrorFallback,
  beforeLoad: async () => {
    const session = await getSession();
    if (!session) {
      throw redirect({ to: '/login' });
    }
    return { session };
  },
  component: DashboardLayout
});

function DashboardLayout() {
  return <Outlet />;
}
