'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { acceptInvitation, getInvitation } from '../actions';

type InvitationState =
  | { status: 'loading' }
  | { status: 'preview'; orgName: string; role: string }
  | { status: 'accepting'; orgName: string; role: string }
  | { status: 'accepted' }
  | { status: 'error'; message: string };

export default function AcceptInvitationPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const invitationId = searchParams.get('id');

  const [state, setState] = useState<InvitationState>({ status: 'loading' });

  useEffect(() => {
    if (!invitationId) {
      setState({ status: 'error', message: 'No invitation ID provided.' });
      return;
    }

    getInvitation(invitationId)
      .then((inv) => {
        if (!inv) {
          setState({ status: 'error', message: 'Invitation not found.' });
          return;
        }
        if (inv.status === 'accepted') {
          setState({ status: 'error', message: 'This invitation has already been accepted.' });
          return;
        }
        if (inv.status === 'canceled') {
          setState({ status: 'error', message: 'This invitation has been canceled.' });
          return;
        }
        if (inv.status === 'rejected') {
          setState({ status: 'error', message: 'This invitation has been rejected.' });
          return;
        }
        if (new Date(inv.expiresAt) < new Date()) {
          setState({ status: 'error', message: 'This invitation has expired.' });
          return;
        }
        setState({
          status: 'preview',
          orgName: inv.organizationName || inv.organizationId,
          role: inv.role || 'member'
        });
      })
      .catch(() => {
        setState({ status: 'error', message: 'Failed to load invitation details.' });
      });
  }, [invitationId]);

  const handleAccept = async () => {
    if (!invitationId) return;
    setState((prev) => {
      const orgName = 'orgName' in prev ? prev.orgName : '';
      const role = 'role' in prev ? prev.role : 'member';
      return { status: 'accepting', orgName, role };
    });

    try {
      await acceptInvitation(invitationId);
      setState({ status: 'accepted' });
    } catch (err) {
      setState({
        status: 'error',
        message: err instanceof Error ? err.message : 'Failed to accept invitation.'
      });
    }
  };

  if (state.status === 'loading') {
    return (
      <div className="flex items-center justify-center py-24">
        <p className="text-muted-foreground text-sm">Loading invitation...</p>
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="flex flex-col items-center justify-center py-24 space-y-4">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold tracking-tight">Invitation Error</h1>
          <p className="text-muted-foreground">{state.message}</p>
        </div>
        <Link href="/orgs">
          <Button variant="outline">Go to Organizations</Button>
        </Link>
      </div>
    );
  }

  if (state.status === 'accepted') {
    return (
      <div className="flex flex-col items-center justify-center py-24 space-y-4">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold tracking-tight">You&apos;re in!</h1>
          <p className="text-muted-foreground">You&apos;ve successfully joined the organization.</p>
        </div>
        <Button onClick={() => router.push('/orgs')}>Go to Organizations</Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-24 space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-2xl font-bold tracking-tight">Organization Invitation</h1>
        <p className="text-muted-foreground">
          You&apos;ve been invited to join <strong>{state.orgName}</strong> as a <strong>{state.role}</strong>.
        </p>
      </div>
      <div className="flex gap-3">
        <Link href="/orgs">
          <Button variant="outline">Decline</Button>
        </Link>
        <Button onClick={handleAccept} disabled={state.status === 'accepting'}>
          {state.status === 'accepting' ? 'Accepting...' : 'Accept Invitation'}
        </Button>
      </div>
    </div>
  );
}
