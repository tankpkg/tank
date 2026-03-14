import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';

import { getSession } from '~/server-fns/auth';

export const Route = createFileRoute('/_dashboard')({
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
