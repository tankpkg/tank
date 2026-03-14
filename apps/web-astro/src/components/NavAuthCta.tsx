import { Button } from '~/components/ui/button';
import { trackCtaClick } from '~/lib/analytics';
import { useSession } from '~/lib/auth-client';

function getDestination(isLoggedIn: boolean): string {
  return isLoggedIn ? '/dashboard' : '/login';
}

export function NavAuthCta() {
  const { data: session } = useSession();
  const isLoggedIn = Boolean(session?.user?.id);
  const destination = getDestination(isLoggedIn);

  return (
    <div className="flex items-center gap-2 sm:gap-3">
      <Button variant="ghost" size="sm" asChild className="hidden sm:inline-flex">
        <a href={destination} onClick={() => trackCtaClick(isLoggedIn ? 'Dashboard' : 'Sign In', destination)}>
          {isLoggedIn ? 'Dashboard' : 'Sign In'}
        </a>
      </Button>
      <Button variant="ghost" size="sm" asChild className="max-lg:hidden">
        <a href="/docs" onClick={() => trackCtaClick('Docs', '/docs')}>
          Docs
        </a>
      </Button>
      <Button size="sm" asChild className="bg-emerald-600 hover:bg-emerald-500 text-white">
        <a href={destination} onClick={() => trackCtaClick(isLoggedIn ? 'Open Dashboard' : 'Get Started', destination)}>
          {isLoggedIn ? 'Open Dashboard' : 'Get Started'}
        </a>
      </Button>
    </div>
  );
}
