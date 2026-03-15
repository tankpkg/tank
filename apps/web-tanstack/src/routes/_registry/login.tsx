import { createFileRoute } from '@tanstack/react-router';

import { LoginScreen } from '~/screens/auth/login-screen';
import { getAuthProviders } from '~/server-fns/session';

export const Route = createFileRoute('/_registry/login')({
  loader: async () => {
    const { providers, oidcProviderId } = await getAuthProviders();
    return { providers, oidcProviderId };
  },
  head: () => ({
    meta: [
      { title: 'Sign In | Tank' },
      { name: 'description', content: 'Sign in to Tank — security-first package manager for AI agent skills.' }
    ]
  }),
  component: LoginPage
});

function LoginPage() {
  const { providers, oidcProviderId } = Route.useLoaderData();

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <LoginScreen enabledProviders={new Set(providers)} oidcProviderId={oidcProviderId} />
    </div>
  );
}
