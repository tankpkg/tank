import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { ChevronDown, ChevronRight, Search, Users } from 'lucide-react';
import { useState } from 'react';

import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/components/ui/table';
import { formatDate } from '~/lib/format';
import { adminOrgMembersFn, adminOrgsFn } from '~/query/admin';

export const Route = createFileRoute('/admin/orgs')({
  component: AdminOrgs
});

function AdminOrgs() {
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [expandedOrg, setExpandedOrg] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'orgs', { q, page }],
    queryFn: () => adminOrgsFn({ data: { q: q || undefined, page, limit: 20 } })
  });

  const { data: members } = useQuery({
    queryKey: ['admin', 'org-members', expandedOrg],
    queryFn: () => (expandedOrg ? adminOrgMembersFn({ data: expandedOrg }) : Promise.resolve([])),
    enabled: !!expandedOrg
  });

  const totalPages = data ? Math.ceil(data.total / data.limit) : 1;

  return (
    <section className="p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Organization Management</h1>
        <p className="mt-1 text-sm text-muted-foreground">View and manage organizations.</p>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="Search organizations..."
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            className="pl-9"
          />
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
                <TableHead>Name</TableHead>
                <TableHead>Slug</TableHead>
                <TableHead>Members</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.orgs.map((org) => (
                <>
                  <TableRow
                    key={org.id}
                    className="cursor-pointer"
                    onClick={() => setExpandedOrg(expandedOrg === org.id ? null : org.id)}>
                    <TableCell>
                      {expandedOrg === org.id ? (
                        <ChevronDown className="size-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="size-4 text-muted-foreground" />
                      )}
                    </TableCell>
                    <TableCell className="font-medium">{org.name}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{org.slug}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <Users className="size-3 text-muted-foreground" />
                        <span className="text-sm">{org.memberCount}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">{formatDate(org.createdAt)}</TableCell>
                  </TableRow>
                  {expandedOrg === org.id && (
                    <TableRow key={`${org.id}-members`}>
                      <TableCell colSpan={5} className="bg-muted/30 p-4">
                        {members && members.length > 0 ? (
                          <div className="space-y-2">
                            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                              Members
                            </p>
                            <div className="space-y-1">
                              {members.map((m) => (
                                <div key={m.id} className="flex items-center gap-3 text-sm">
                                  <span className="font-medium">{m.userName}</span>
                                  <span className="text-muted-foreground">{m.userEmail}</span>
                                  <Badge variant="outline" className="text-xs">
                                    {m.role}
                                  </Badge>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground">No members found.</p>
                        )}
                      </TableCell>
                    </TableRow>
                  )}
                </>
              ))}
              {data?.orgs.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    No organizations found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>

          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                Page {page} of {totalPages} ({data?.total} total)
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                  Previous
                </Button>
                <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
