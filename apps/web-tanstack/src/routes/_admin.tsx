import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';

import { ErrorFallback } from '~/components/error-fallback';
import { getAdminSession } from '~/server-fns/session';

export const Route = createFileRoute('/_admin')({
  errorComponent: ErrorFallback,
  beforeLoad: async ({ location }) => {
    const session = await getAdminSession();
    if (!session) {
      throw redirect({ to: '/login', search: { redirect: location.href } });
    }
    return { session };
  },
  component: AdminLayout
});

function AdminLayout() {
  return <Outlet />;
}
