import { createFileRoute, redirect } from '@tanstack/react-router';
import { getSession } from '~/lib/auth/session';
import { CliLoginScreen } from '~/screens/cli-login-screen';

export const Route = createFileRoute('/_registry/cli-login')({
  validateSearch: (search: Record<string, unknown>) => ({
    session: (search.session as string) || ''
  }),
  beforeLoad: async () => {
    const session = await getSession();
    if (!session) {
      throw redirect({ to: '/login' });
    }
  },
  head: () => ({
    meta: [{ title: 'Authorize CLI | Tank' }]
  }),
  component: CliLoginPage
});

function CliLoginPage() {
  const { session } = Route.useSearch();

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <CliLoginScreen sessionCode={session} />
    </div>
  );
}
