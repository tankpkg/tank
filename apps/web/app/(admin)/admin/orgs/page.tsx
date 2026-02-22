import Link from 'next/link';
import { headers } from 'next/headers';
import { Suspense } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

type SearchParams = {
  search?: string;
  page?: string;
};

interface OrgItem {
  id: string;
  name: string;
  slug: string;
  logo: string | null;
  createdAt: string;
  memberCount: number;
  packageCount: number;
}

interface OrgsResponse {
  orgs: OrgItem[];
  total: number;
  page: number;
  totalPages: number;
}

const DEFAULT_LIMIT = 25;
const SKELETON_ROWS = ['row-1', 'row-2', 'row-3', 'row-4', 'row-5', 'row-6'];

function parsePage(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? '1', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function buildQuery(searchParams: SearchParams, pageOverride?: number): string {
  const params = new URLSearchParams();
  const search = searchParams.search?.trim();
  const page = pageOverride ?? parsePage(searchParams.page);

  if (search) params.set('search', search);
  params.set('page', page.toString());

  return params.toString();
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

async function fetchOrgs(searchParams: SearchParams): Promise<OrgsResponse> {
  const requestHeaders = new Headers(await headers());
  requestHeaders.set('accept', 'application/json');

  const host = requestHeaders.get('host');
  const protocol = requestHeaders.get('x-forwarded-proto') ?? 'http';
  const baseUrl = host ? `${protocol}://${host}` : '';
  const query = buildQuery(searchParams);

  const response = await fetch(`${baseUrl}/api/admin/orgs?${query}`, {
    cache: 'no-store',
    headers: requestHeaders,
  });

  if (!response.ok) {
    throw new Error('Failed to load organizations');
  }

  return (await response.json()) as OrgsResponse;
}

function OrgsTableSkeleton() {
  return (
    <div className="border rounded-lg">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Slug</TableHead>
            <TableHead>Members</TableHead>
            <TableHead>Packages</TableHead>
            <TableHead>Created</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {SKELETON_ROWS.map((rowId) => (
            <TableRow key={rowId}>
              <TableCell>
                <div className="h-4 w-40 bg-muted rounded animate-pulse" />
              </TableCell>
              <TableCell>
                <div className="h-4 w-32 bg-muted rounded animate-pulse" />
              </TableCell>
              <TableCell>
                <div className="h-4 w-16 bg-muted rounded animate-pulse" />
              </TableCell>
              <TableCell>
                <div className="h-4 w-16 bg-muted rounded animate-pulse" />
              </TableCell>
              <TableCell>
                <div className="h-4 w-24 bg-muted rounded animate-pulse" />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

async function OrgsTable({ searchParams }: { searchParams: SearchParams }) {
  try {
    const data = await fetchOrgs(searchParams);
    const currentPage = data.page;
    const totalPages = data.totalPages;
    const search = searchParams.search?.trim() ?? '';

    return (
      <div className="space-y-4">
        <form method="get" className="flex flex-wrap gap-3 items-end">
          <div className="w-full sm:w-64">
            <label className="text-xs font-medium text-muted-foreground" htmlFor="search">
              Search
            </label>
            <Input
              id="search"
              name="search"
              placeholder="Organization name or slug"
              defaultValue={search}
            />
          </div>
          <div className="flex gap-2">
            <Button type="submit">Apply</Button>
            <Button variant="outline" asChild>
              <Link href="/admin/orgs">Reset</Link>
            </Button>
          </div>
        </form>

        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Slug</TableHead>
                <TableHead>Members</TableHead>
                <TableHead>Packages</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.orgs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    No organizations found.
                  </TableCell>
                </TableRow>
              ) : (
                data.orgs.map((org) => (
                  <TableRow key={org.id} className="hover:bg-muted/40">
                    <TableCell>
                      <Link href={`/admin/orgs/${org.id}`} className="flex items-center gap-3">
                        {org.logo ? (
                          <img
                            src={org.logo}
                            alt={org.name}
                            className="h-8 w-8 rounded object-cover"
                          />
                        ) : (
                          <div className="h-8 w-8 rounded bg-muted flex items-center justify-center text-xs font-medium">
                            {org.name.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <span className="font-medium text-foreground">{org.name}</span>
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Link href={`/admin/orgs/${org.id}`} className="block text-muted-foreground font-mono text-sm">
                        {org.slug}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Link href={`/admin/orgs/${org.id}`} className="block">
                        <Badge variant="secondary">{org.memberCount} members</Badge>
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Link href={`/admin/orgs/${org.id}`} className="block text-muted-foreground">
                        {org.packageCount}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Link href={`/admin/orgs/${org.id}`} className="block text-muted-foreground">
                        {formatDate(org.createdAt)}
                      </Link>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Showing page {currentPage} of {Math.max(totalPages, 1)} ({data.total} organizations)
          </p>
          <div className="flex gap-2">
            {currentPage > 1 ? (
              <Button variant="outline" asChild>
                <Link href={`/admin/orgs?${buildQuery(searchParams, currentPage - 1)}`}>
                  Previous
                </Link>
              </Button>
            ) : (
              <Button variant="outline" disabled>
                Previous
              </Button>
            )}
            {currentPage < totalPages ? (
              <Button asChild>
                <Link href={`/admin/orgs?${buildQuery(searchParams, currentPage + 1)}`}>
                  Next
                </Link>
              </Button>
            ) : (
              <Button disabled>Next</Button>
            )}
          </div>
        </div>
      </div>
    );
  } catch (error) {
    return (
      <div className="border rounded-lg p-6 text-sm text-destructive">
        {error instanceof Error ? error.message : 'Failed to load organizations.'}
      </div>
    );
  }
}

export default async function AdminOrgsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const resolvedSearchParams = await searchParams;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Organizations</h1>
        <p className="text-muted-foreground mt-1">
          View and manage all organizations in the registry.
        </p>
      </div>
      <Suspense fallback={<OrgsTableSkeleton />}>
        <OrgsTable searchParams={resolvedSearchParams} />
      </Suspense>
    </div>
  );
}
