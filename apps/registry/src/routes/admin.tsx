import { createFileRoute, redirect } from '@tanstack/react-router';

import { ErrorFallback } from '~/components/error-fallback';
import { getAdminSession } from '~/lib/auth/session';
import { AdminScreen } from '~/screens/admin-screen';

export const Route = createFileRoute('/admin')({
  errorComponent: ErrorFallback,
  beforeLoad: async ({ location }) => {
    const session = await getAdminSession();
    if (!session) throw redirect({ to: '/login', search: { redirect: location.href } });
    return { session };
  },
  component: AdminScreen
});
