import { Link } from '@tanstack/react-router';
import { ArrowLeft, Search, Shield } from 'lucide-react';

import { StatusPage } from '~/components/status-page';
import { Button } from '~/components/ui/button';

export function NotFoundScreen() {
  return (
    <StatusPage
      icon={<Shield className="size-8 text-tank-cyan" />}
      title="404"
      description="The page you're looking for doesn't exist or has been moved.">
      <Button asChild size="lg" className="gap-2 bg-brand hover:bg-brand/90">
        <Link to="/">
          <ArrowLeft className="size-4" />
          Go Home
        </Link>
      </Button>
      <Button asChild variant="outline" size="lg" className="gap-2">
        <Link to="/skills" search={{}}>
          <Search className="size-4" />
          Browse Skills
        </Link>
      </Button>
    </StatusPage>
  );
}
