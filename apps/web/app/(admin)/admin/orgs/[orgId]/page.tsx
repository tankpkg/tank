import Link from 'next/link';
import { headers } from 'next/headers';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { MemberList } from './components/member-list';

interface OrgDetailsResponse {
  id: string;
  name: string;
  slug: string;
  logo: string | null;
  createdAt: string;
  memberCount: number;
  packageCount: number;
  members: {
    id: string;
    userId: string;
    name: string | null;
    email: string;
    role: string;
    createdAt: string;
  }[];
  packages: {
    id: string;
    name: string;
    status: string;
  }[];
}

async function fetchOrgDetails(orgId: string): Promise<OrgDetailsResponse> {
  const requestHeaders = new Headers(await headers());
  requestHeaders.set('accept', 'application/json');

  const host = requestHeaders.get('host');
  const protocol = requestHeaders.get('x-forwarded-proto') ?? 'http';
  const baseUrl = host ? `${protocol}://${host}` : '';

  const response = await fetch(`${baseUrl}/api/admin/orgs/${encodeURIComponent(orgId)}`, {
    cache: 'no-store',
    headers: requestHeaders,
  });

  if (!response.ok) {
    throw new Error('Failed to load organization details.');
  }

  return (await response.json()) as OrgDetailsResponse;
}

export default async function AdminOrgDetailPage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;
  const org = await fetchOrgDetails(orgId);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {org.logo ? (
            <img src={org.logo} alt={org.name} className="h-10 w-10 rounded object-cover" />
          ) : (
            <div className="h-10 w-10 rounded bg-muted flex items-center justify-center font-medium">
              {org.name.charAt(0).toUpperCase()}
            </div>
          )}
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{org.name}</h1>
            <p className="text-muted-foreground mt-1 font-mono text-sm">{org.slug}</p>
          </div>
        </div>
        <Link
          href="/admin/orgs"
          className="inline-flex h-9 items-center justify-center rounded-md border bg-background px-4 text-sm font-medium shadow-xs hover:bg-accent hover:text-accent-foreground"
        >
          Back
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription>Members</CardDescription>
            <CardTitle>{org.memberCount}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Packages</CardDescription>
            <CardTitle>{org.packageCount}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Created</CardDescription>
            <CardTitle className="text-base font-semibold">
              {new Date(org.createdAt).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
              })}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Members</CardTitle>
            <CardDescription>Manage organization membership.</CardDescription>
          </CardHeader>
          <CardContent>
            <MemberList orgId={org.id} members={org.members} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Packages</CardTitle>
            <CardDescription>Packages currently assigned to this organization.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {org.packages.length === 0 ? (
              <p className="text-sm text-muted-foreground">No packages assigned.</p>
            ) : (
              org.packages.map((pkg) => (
                <div
                  key={pkg.id}
                  className="rounded-md border p-3 flex items-center justify-between gap-3"
                >
                  <Link href={`/admin/packages/${encodeURIComponent(pkg.name)}`} className="font-medium">
                    {pkg.name}
                  </Link>
                  <Badge variant="outline">{pkg.status}</Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
