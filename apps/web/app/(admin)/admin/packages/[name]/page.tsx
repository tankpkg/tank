import Link from 'next/link';
import { headers } from 'next/headers';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FeatureButton } from './components/feature-button';
import { StatusDialog } from './components/status-dialog';

type PackageStatus = 'active' | 'deprecated' | 'quarantined' | 'removed';

interface PackageDetailResponse {
  package: {
    id: string;
    name: string;
    description: string | null;
    readme: string | null;
    status: PackageStatus;
    statusReason: string | null;
    featured: boolean;
    createdAt: string;
    updatedAt: string;
    publisher: {
      id: string;
      name: string | null;
      email: string;
      githubUsername: string | null;
    } | null;
    versions: {
      id: string;
      version: string;
      createdAt: string;
      scanStatus: string | null;
    }[];
    downloadCount: number;
    statusHistory: {
      id: string;
      action: string;
      metadata: unknown;
      actorId: string;
      createdAt: string;
    }[];
  };
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function statusVariant(status: PackageStatus): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (status === 'removed') return 'destructive';
  if (status === 'quarantined') return 'outline';
  if (status === 'deprecated') return 'secondary';
  return 'default';
}

async function fetchPackageDetails(name: string): Promise<PackageDetailResponse> {
  const requestHeaders = new Headers(await headers());
  requestHeaders.set('accept', 'application/json');

  const host = requestHeaders.get('host');
  const protocol = requestHeaders.get('x-forwarded-proto') ?? 'http';
  const baseUrl = host ? `${protocol}://${host}` : '';

  const response = await fetch(
    `${baseUrl}/api/admin/packages/${encodeURIComponent(name)}`,
    {
      cache: 'no-store',
      headers: requestHeaders,
    },
  );

  if (!response.ok) {
    throw new Error('Failed to load package details.');
  }

  return (await response.json()) as PackageDetailResponse;
}

export default async function AdminPackageDetailPage({
  params,
}: {
  params: Promise<{ name: string }>;
}) {
  const { name } = await params;
  const data = await fetchPackageDetails(name);
  const pkg = data.package;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{pkg.name}</h1>
          <p className="text-muted-foreground mt-1">
            {pkg.description ?? 'No description provided.'}
          </p>
        </div>
        <BackLink href="/admin/packages" />
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader>
            <CardDescription>Status</CardDescription>
            <CardTitle>
              <Badge variant={statusVariant(pkg.status)}>{pkg.status}</Badge>
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Downloads</CardDescription>
            <CardTitle>{pkg.downloadCount}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Versions</CardDescription>
            <CardTitle>{pkg.versions.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Featured</CardDescription>
            <CardTitle>{pkg.featured ? 'Yes' : 'No'}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Versions</CardTitle>
              <CardDescription>Published versions and scan statuses.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {pkg.versions.length === 0 ? (
                <p className="text-sm text-muted-foreground">No versions found.</p>
              ) : (
                pkg.versions.map((version) => (
                  <div
                    key={version.id}
                    className="rounded-md border p-3 flex flex-wrap items-center justify-between gap-2"
                  >
                    <div>
                      <p className="font-medium">{version.version}</p>
                      <p className="text-xs text-muted-foreground">{formatDate(version.createdAt)}</p>
                    </div>
                    <Badge variant="outline">{version.scanStatus ?? 'unknown'}</Badge>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Audit history</CardTitle>
              <CardDescription>Latest moderation actions.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {pkg.statusHistory.length === 0 ? (
                <p className="text-sm text-muted-foreground">No moderation events yet.</p>
              ) : (
                pkg.statusHistory.map((entry) => (
                  <div key={entry.id} className="rounded-md border p-3">
                    <p className="font-medium">{entry.action}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(entry.createdAt)}</p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <StatusDialog packageName={pkg.name} currentStatus={pkg.status} />
          <Card>
            <CardHeader>
              <CardTitle>Featuring</CardTitle>
              <CardDescription>Highlight this package in discovery surfaces.</CardDescription>
            </CardHeader>
            <CardContent>
              <FeatureButton packageName={pkg.name} featured={pkg.featured} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Publisher</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-1">
              <p>{pkg.publisher?.name ?? 'Unknown'}</p>
              <p>{pkg.publisher?.email ?? '—'}</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function BackLink({ href }: { href: string }) {
  return (
    <Link
      href={href}
      className="inline-flex h-9 items-center justify-center rounded-md border bg-background px-4 text-sm font-medium shadow-xs hover:bg-accent hover:text-accent-foreground"
    >
      Back
    </Link>
  );
}
