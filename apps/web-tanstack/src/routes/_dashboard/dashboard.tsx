import { createFileRoute } from '@tanstack/react-router';

import { TokensScreen } from '~/screens/dashboard/tokens-screen';

export const Route = createFileRoute('/_dashboard/dashboard')({
  component: DashboardPage
});

function DashboardPage() {
  return <TokensScreen />;
}
