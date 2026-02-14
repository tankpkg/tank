'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { getOrgDetails, inviteMember, removeMember } from '../actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

interface Member {
  id: string;
  userId: string;
  role: string;
  user: {
    id: string;
    name: string;
    email: string;
  };
}

interface OrgDetails {
  id: string;
  name: string;
  slug: string;
  logo: string | null;
  createdAt: Date;
  members: Member[];
}

export default function OrgDetailPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;

  const [org, setOrg] = useState<OrgDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviting, setInviting] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadOrg = useCallback(async () => {
    try {
      const result = await getOrgDetails(slug);
      setOrg(result as unknown as OrgDetails);
    } catch {
      // Org not found or not authorized
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    loadOrg();
  }, [loadOrg]);

  const handleInvite = async () => {
    if (!inviteEmail.trim() || !org) return;

    setInviting(true);
    setError(null);
    try {
      await inviteMember({
        organizationId: org.id,
        email: inviteEmail.trim(),
        role: 'member',
      });
      setInviteEmail('');
      setInviteOpen(false);
      await loadOrg();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to invite member');
    } finally {
      setInviting(false);
    }
  };

  const handleRemove = async (memberId: string) => {
    if (!org) return;

    setRemovingId(memberId);
    try {
      await removeMember({
        organizationId: org.id,
        memberIdOrEmail: memberId,
      });
      await loadOrg();
    } catch (err) {
      console.error('Failed to remove member:', err);
    } finally {
      setRemovingId(null);
    }
  };

  if (loading) {
    return (
      <div className="text-muted-foreground text-sm py-8 text-center">
        Loading organization...
      </div>
    );
  }

  if (!org) {
    return (
      <div className="space-y-4">
        <div className="text-center py-12 border rounded-lg">
          <p className="text-muted-foreground">Organization not found.</p>
          <Link href="/orgs" className="text-sm text-primary hover:underline mt-2 inline-block">
            Back to organizations
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
          <Link href="/orgs" className="hover:text-foreground transition-colors">
            Organizations
          </Link>
          <span>/</span>
          <span>{org.name}</span>
        </div>
        <h1 className="text-3xl font-bold tracking-tight">{org.name}</h1>
        <p className="text-muted-foreground mt-1 font-mono text-sm">{org.slug}</p>
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Members</h2>
        <Dialog open={inviteOpen} onOpenChange={(open) => {
          setInviteOpen(open);
          if (!open) {
            setInviteEmail('');
            setError(null);
          }
        }}>
          <DialogTrigger asChild>
            <Button>Invite Member</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Invite Member</DialogTitle>
              <DialogDescription>
                Invite a user to join this organization by their email address.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="invite-email">Email address</Label>
                <Input
                  id="invite-email"
                  type="email"
                  placeholder="user@example.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleInvite();
                  }}
                />
              </div>
              {error && (
                <p className="text-sm text-destructive">{error}</p>
              )}
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setInviteOpen(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={handleInvite}
                disabled={inviting || !inviteEmail.trim()}
              >
                {inviting ? 'Inviting...' : 'Send Invitation'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {org.members.length === 0 ? (
        <div className="text-center py-8 border rounded-lg">
          <p className="text-muted-foreground">No members yet.</p>
        </div>
      ) : (
        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {org.members.map((member) => (
                <TableRow key={member.id}>
                  <TableCell className="font-medium">
                    {member.user.name || 'Unknown'}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {member.user.email}
                  </TableCell>
                  <TableCell>
                    <Badge variant={member.role === 'owner' ? 'default' : 'secondary'}>
                      {member.role}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {member.role !== 'owner' && (
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleRemove(member.id)}
                        disabled={removingId === member.id}
                      >
                        {removingId === member.id ? 'Removing...' : 'Remove'}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
