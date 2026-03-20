import { createFileRoute, Link, redirect } from '@tanstack/react-router';
import { CheckCircle, XCircle } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Button } from '~/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { getSession } from '~/lib/auth/session';
import { acceptInvitationFn } from '~/query/orgs';

export const Route = createFileRoute('/_auth/orgs/accept-invitation')({
  validateSearch: (search: Record<string, unknown>) => ({
    id: (search.id as string) || ''
  }),
  beforeLoad: async ({ location }) => {
    const session = await getSession();
    if (!session) throw redirect({ to: '/login', search: { redirect: location.href } });
    return { session };
  },
  component: AcceptInvitationPage
});

function AcceptInvitationPage() {
  const { id } = Route.useSearch();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      setStatus('error');
      setError('Missing invitation ID');
      return;
    }

    acceptInvitationFn({ data: { invitationId: id } })
      .then(() => setStatus('success'))
      .catch((e) => {
        setStatus('error');
        setError(e instanceof Error ? e.message : 'Failed to accept invitation');
      });
  }, [id]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {status === 'loading' && 'Accepting invitation...'}
            {status === 'success' && (
              <>
                <CheckCircle className="size-5 text-tank" />
                Invitation Accepted
              </>
            )}
            {status === 'error' && (
              <>
                <XCircle className="size-5 text-destructive" />
                Failed
              </>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {status === 'loading' && <p className="text-sm text-muted-foreground">Please wait...</p>}
          {status === 'success' && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">You have successfully joined the organization.</p>
              <Button asChild>
                <Link to="/dashboard/orgs">Go to Dashboard</Link>
              </Button>
            </div>
          )}
          {status === 'error' && (
            <div className="space-y-4">
              <p className="text-sm text-destructive">{error}</p>
              <Button asChild variant="outline">
                <Link to="/dashboard">Go to Dashboard</Link>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
