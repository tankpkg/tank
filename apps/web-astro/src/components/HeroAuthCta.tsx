import { ArrowRight } from 'lucide-react';

import { Button } from '~/components/ui/button';
import { trackCtaClick } from '~/lib/analytics';
import { useSession } from '~/lib/auth-client';

function getDestination(isLoggedIn: boolean): string {
  return isLoggedIn ? '/dashboard' : '/login';
}

export function HeroAuthCta({ size = 'lg', testId }: { size?: 'sm' | 'lg'; testId?: string }) {
  const { data: session } = useSession();
  const isLoggedIn = Boolean(session?.user?.id);
  const destination = getDestination(isLoggedIn);

  return (
    <Button size={size} asChild className="bg-emerald-600 hover:bg-emerald-500 text-white group">
      <a
        href={destination}
        data-testid={testId}
        onClick={() => trackCtaClick(isLoggedIn ? 'Open Dashboard' : 'Get Started', destination)}>
        {isLoggedIn ? 'Open Dashboard' : 'Get Started'}
        <ArrowRight className="ml-2 w-4 h-4 group-hover:translate-x-1 transition-transform" />
      </a>
    </Button>
  );
}
