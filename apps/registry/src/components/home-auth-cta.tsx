import { Link } from '@tanstack/react-router';
import { ArrowRight } from 'lucide-react';

import { Button } from '~/components/ui/button';
import { useSession } from '~/lib/auth/client';

function getDestination(isLoggedIn: boolean): string {
  return isLoggedIn ? '/dashboard' : '/login';
}

function UserAvatar({ name, image }: { name?: string | null; image?: string | null }) {
  const initials = (name || '?').slice(0, 2).toUpperCase();

  return (
    <Link to="/dashboard" className="shrink-0">
      {image ? (
        <img src={image} alt={name || 'User'} className="size-8 rounded-full object-cover ring-1 ring-border" />
      ) : (
        <div className="size-8 rounded-full bg-muted flex items-center justify-center text-xs font-medium ring-1 ring-border">
          {initials}
        </div>
      )}
    </Link>
  );
}

export function HomeNavAuthCta() {
  const { data: session } = useSession();
  const isLoggedIn = Boolean(session?.user?.id);
  const destination = getDestination(isLoggedIn);

  if (isLoggedIn) {
    return (
      <div className="flex items-center gap-2 sm:gap-3">
        <Button size="sm" asChild className="hidden sm:inline-flex">
          <Link to="/dashboard">Dashboard</Link>
        </Button>
        <UserAvatar name={session?.user?.name} image={session?.user?.image} />
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 sm:gap-3">
      <Button variant="ghost" size="sm" asChild className="hidden sm:inline-flex">
        <Link to={destination}>Sign In</Link>
      </Button>
      <Button size="sm" asChild>
        <Link to={destination}>Get Started</Link>
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
