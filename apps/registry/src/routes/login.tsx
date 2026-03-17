import { createFileRoute } from '@tanstack/react-router';
import { routeHead } from '~/consts/seo';
import { getAuthProviders } from '~/lib/auth/session';
import { LoginScreen } from '~/screens/login-screen';

const settings = routeHead({
  title: 'Sign In | Tank',
  description: 'Sign in to Tank — security-first package manager for AI agent skills.',
  path: '/login'
});

export const Route = createFileRoute('/login')({
  loader: async () => {
    const { providers, oidcProviderId } = await getAuthProviders();
    return { providers, oidcProviderId };
  },
  head: () => settings,
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
