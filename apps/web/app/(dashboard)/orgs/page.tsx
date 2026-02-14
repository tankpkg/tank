'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { createOrg, listOrgs, validateOrgSlug } from './actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

interface OrgItem {
  id: string;
  name: string;
  slug: string;
  logo: string | null;
  createdAt: Date;
  members?: { id: string }[];
}

function nameToSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 39);
}

export default function OrgsPage() {
  const [orgs, setOrgs] = useState<OrgItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [orgName, setOrgName] = useState('');
  const [orgSlug, setOrgSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadOrgs = useCallback(async () => {
    try {
      const result = await listOrgs();
      setOrgs((result ?? []) as OrgItem[]);
    } catch {
      // User may not be authenticated — layout handles redirect
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOrgs();
  }, [loadOrgs]);

  const handleNameChange = (value: string) => {
    setOrgName(value);
    if (!slugTouched) {
      setOrgSlug(nameToSlug(value));
    }
  };

  const handleSlugChange = (value: string) => {
    setSlugTouched(true);
    setOrgSlug(value.toLowerCase());
  };

  const handleCreate = async () => {
    if (!orgName.trim() || !orgSlug.trim()) return;

    setCreating(true);
    setError(null);

    const validation = await validateOrgSlug(orgSlug);
    if (!validation.valid) {
      setError(validation.error ?? 'Invalid slug');
      setCreating(false);
      return;
    }
    try {
      await createOrg({ name: orgName.trim(), slug: orgSlug });
      setOrgName('');
      setOrgSlug('');
      setSlugTouched(false);
      setCreateOpen(false);
      await loadOrgs();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create organization');
    } finally {
      setCreating(false);
    }
  };

  const handleDialogChange = (open: boolean) => {
    setCreateOpen(open);
    if (!open) {
      setOrgName('');
      setOrgSlug('');
      setSlugTouched(false);
      setError(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Organizations</h1>
          <p className="text-muted-foreground mt-1">
            Manage your organizations and team members.
          </p>
        </div>

        <Dialog open={createOpen} onOpenChange={handleDialogChange}>
          <DialogTrigger asChild>
            <Button>Create Organization</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Organization</DialogTitle>
              <DialogDescription>
                Create a new organization to collaborate with your team.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="org-name">Organization name</Label>
                <Input
                  id="org-name"
                  placeholder="e.g. My Team"
                  value={orgName}
                  onChange={(e) => handleNameChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCreate();
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="org-slug">Slug</Label>
                <Input
                  id="org-slug"
                  placeholder="e.g. my-team"
                  value={orgSlug}
                  onChange={(e) => handleSlugChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCreate();
                  }}
                />
                <p className="text-xs text-muted-foreground">
                  Lowercase letters, numbers, and hyphens. Max 39 characters.
                </p>
              </div>
              {error && (
                <p className="text-sm text-destructive">{error}</p>
              )}
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => handleDialogChange(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={handleCreate}
                disabled={creating || !orgName.trim() || !orgSlug.trim()}
              >
                {creating ? 'Creating...' : 'Create'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="text-muted-foreground text-sm py-8 text-center">
          Loading organizations...
        </div>
      ) : orgs.length === 0 ? (
        <div className="text-center py-12 border rounded-lg">
          <p className="text-muted-foreground">No organizations yet.</p>
          <p className="text-muted-foreground text-sm mt-1">
            Create an organization to start collaborating with your team.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {orgs.map((org) => (
            <Link key={org.id} href={`/orgs/${org.slug}`}>
              <Card className="hover:border-foreground/20 transition-colors cursor-pointer">
                <CardHeader>
                  <CardTitle className="text-lg">{org.name}</CardTitle>
                  <CardDescription className="font-mono text-xs">
                    {org.slug}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    Created {new Date(org.createdAt).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                    })}
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
