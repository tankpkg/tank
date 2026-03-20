import { createFileRoute, Link } from '@tanstack/react-router';
import { ChevronRight, UserMinus, UserPlus } from 'lucide-react';
import { useCallback, useState } from 'react';

import { Button } from '~/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '~/components/ui/dialog';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/components/ui/table';
import { getOrgFn, inviteMemberFn, removeMemberFn } from '~/query/orgs';

export const Route = createFileRoute('/dashboard/orgs/$slug')({
  component: OrgDetailPage
});

interface Member {
  id: string;
  userId: string;
  role: string;
  user: { name: string | null; email: string };
}

interface OrgData {
  id: string;
  name: string;
  slug: string;
  members: Member[];
}

function OrgDetailPage() {
  const { slug } = Route.useParams();
  const [org, setOrg] = useState<OrgData | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('member');
  const [inviting, setInviting] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const fetchOrg = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getOrgFn({ data: slug });
      setOrg(result as unknown as OrgData);
      setLoaded(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load organization');
    } finally {
      setLoading(false);
    }
  }, [slug]);

  if (!loaded && !loading) {
    fetchOrg();
  }

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!org) return;
    setInviting(true);
    setError(null);
    try {
      await inviteMemberFn({
        data: {
          organizationId: org.id,
          email: inviteEmail,
          role: inviteRole as 'member' | 'admin' | 'owner'
        }
      });
      setInviteEmail('');
      setInviteRole('member');
      setInviteOpen(false);
      await fetchOrg();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send invitation');
    } finally {
      setInviting(false);
    }
  };

  const handleRemove = async (memberIdOrUserId: string) => {
    if (!org) return;
    setRemovingId(memberIdOrUserId);
    setError(null);
    try {
      await removeMemberFn({ data: { organizationId: org.id, memberIdOrEmail: memberIdOrUserId } });
      await fetchOrg();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to remove member');
    } finally {
      setRemovingId(null);
    }
  };

  if (loading && !loaded) {
    return (
      <section className="p-8">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </section>
    );
  }

  if (!org) {
    return (
      <section className="p-8">
        {error && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}
      </section>
    );
  }

  return (
    <section className="p-8 space-y-8">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link to="/dashboard/orgs" className="hover:text-foreground transition-colors">
          Organizations
        </Link>
        <ChevronRight className="size-3" />
        <span className="text-foreground">{org.name}</span>
      </div>

      <div>
        <h1 className="text-3xl font-semibold">{org.name}</h1>
        <p className="mt-1 text-sm text-muted-foreground">@{org.slug}</p>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Members</h2>
          <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <UserPlus className="size-4" />
                Invite Member
              </Button>
            </DialogTrigger>
            <DialogContent>
              <form onSubmit={handleInvite}>
                <DialogHeader>
                  <DialogTitle>Invite Member</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="invite-email">Email</Label>
                    <Input
                      id="invite-email"
                      type="email"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="invite-role">Role</Label>
                    <select
                      id="invite-role"
                      value={inviteRole}
                      onChange={(e) => setInviteRole(e.target.value)}
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] outline-none">
                      <option value="member">Member</option>
                      <option value="admin">Admin</option>
                      <option value="owner">Owner</option>
                    </select>
                  </div>
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={inviting}>
                    {inviting ? 'Sending...' : 'Send Invitation'}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

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
                <TableCell>{member.user.name || '—'}</TableCell>
                <TableCell>{member.user.email}</TableCell>
                <TableCell className="capitalize">{member.role}</TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    disabled={removingId === member.id}
                    onClick={() => handleRemove(member.id)}>
                    <UserMinus className="size-4 text-destructive" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {org.members.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  No members
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
