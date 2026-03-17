import { createFileRoute, redirect } from '@tanstack/react-router';

import { ErrorFallback } from '~/components/error-fallback';
import { getSession } from '~/lib/auth/session';
import { TokensScreen } from '~/screens/tokens-screen';

export const Route = createFileRoute('/dashboard')({
  errorComponent: ErrorFallback,
  beforeLoad: async ({ location }) => {
    const session = await getSession();
    if (!session) throw redirect({ to: '/login', search: { redirect: location.href } });
    return { session };
  },
  component: TokensScreen
});
