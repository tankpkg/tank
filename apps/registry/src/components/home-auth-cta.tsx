import { Link } from '@tanstack/react-router';
import { ArrowRight } from 'lucide-react';
import { Button } from '~/components/ui/button';
import { useSession } from '~/lib/auth/client';

function getDestination(isLoggedIn: boolean): string {
  return isLoggedIn ? '/dashboard' : '/login';
}

export function HomeNavAuthCta() {
  const { data: session } = useSession();
  const isLoggedIn = Boolean(session?.user?.id);
  const destination = getDestination(isLoggedIn);

  return (
    <div className="flex items-center gap-2 sm:gap-3">
      <Button variant="ghost" size="sm" asChild className="hidden sm:inline-flex">
        <Link to={destination}>{isLoggedIn ? 'Dashboard' : 'Sign In'}</Link>
      </Button>
      <Button size="sm" asChild>
        <Link to={destination}>{isLoggedIn ? 'Open Dashboard' : 'Get Started'}</Link>
      </Button>
    </div>
  );
}

export function HomePrimaryAuthCta({ size = 'lg', testId }: { size?: 'sm' | 'lg'; testId?: string }) {
  const { data: session } = useSession();
  const isLoggedIn = Boolean(session?.user?.id);
  const destination = getDestination(isLoggedIn);

  return (
    <Button variant="outline" size={size} asChild className="group">
      <Link to={destination} data-testid={testId}>
        {isLoggedIn ? 'Open Dashboard' : 'Get Started'}
        <ArrowRight className="ml-2 w-4 h-4 group-hover:translate-x-1 transition-transform" />
      </Link>
    </Button>
  );
}
