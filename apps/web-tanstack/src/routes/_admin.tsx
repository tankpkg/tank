import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';

import { getAdminSession } from '~/server-fns/auth';

export const Route = createFileRoute('/_admin')({
  beforeLoad: async () => {
    const session = await getAdminSession();
    if (!session) {
      throw redirect({ to: '/login' });
    }
    return { session };
  },
  component: AdminLayout
});

function AdminLayout() {
  return <Outlet />;
}
