import { createFileRoute } from '@tanstack/react-router';

import { getAdminStatsFn } from '~/query/admin';
import { AdminScreen } from '~/screens/admin-screen';

export const Route = createFileRoute('/admin/')({
  loader: () => getAdminStatsFn(),
  component: AdminOverview
});

function AdminOverview() {
  const stats = Route.useLoaderData();
  return <AdminScreen {...stats} />;
}
