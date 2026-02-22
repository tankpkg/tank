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
import { RescanSkillsButton } from '@/components/admin/rescan-skills-button';

type SearchParams = {
  search?: string;
  status?: string;
  featured?: string;
  page?: string;
};

type PackageStatus = 'active' | 'deprecated' | 'quarantined' | 'removed';

interface PackageItem {
  id: string;
  name: string;
  description: string | null;
  status: PackageStatus;
  featured: boolean;
  publisherId: string;
  publisher: {
    name: string | null;
    email: string;
  } | null;
  versionCount: number;
  downloadCount: number;
  createdAt: string;
  updatedAt: string;
}

interface PackagesResponse {
  packages: PackageItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

const STATUS_OPTIONS = [
  { value: 'all', label: 'All statuses' },
  { value: 'active', label: 'Active' },
  { value: 'deprecated', label: 'Deprecated' },
  { value: 'quarantined', label: 'Quarantined' },
  { value: 'removed', label: 'Removed' },
];

const FEATURED_OPTIONS = [
  { value: 'all', label: 'All packages' },
  { value: 'true', label: 'Featured' },
  { value: 'false', label: 'Not featured' },
];

const DEFAULT_LIMIT = 25;
const SKELETON_ROWS = ['row-1', 'row-2', 'row-3', 'row-4', 'row-5', 'row-6'];

function parsePage(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? '1', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function buildQuery(searchParams: SearchParams, pageOverride?: number): string {
  const params = new URLSearchParams();
  const search = searchParams.search?.trim();
  const status = searchParams.status;
  const featured = searchParams.featured;
  const page = pageOverride ?? parsePage(searchParams.page);

  if (search) params.set('search', search);
  if (status === 'active' || status === 'deprecated' || status === 'quarantined' || status === 'removed') {
    params.set('status', status);
  }
  if (featured === 'true' || featured === 'false') {
    params.set('featured', featured);
  }
  params.set('page', page.toString());
  params.set('limit', DEFAULT_LIMIT.toString());

  return params.toString();
}

function statusVariant(status: PackageStatus): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (status === 'removed') return 'destructive';
  if (status === 'quarantined') return 'outline';
  if (status === 'deprecated') return 'secondary';
  return 'default';
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

function formatNumber(value: number): string {
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
  return value.toString();
}

async function fetchPackages(searchParams: SearchParams): Promise<PackagesResponse> {
  const requestHeaders = new Headers(await headers());
  requestHeaders.set('accept', 'application/json');

  const host = requestHeaders.get('host');
  const protocol = requestHeaders.get('x-forwarded-proto') ?? 'http';
  const baseUrl = host ? `${protocol}://${host}` : '';
  const query = buildQuery(searchParams);

  const response = await fetch(`${baseUrl}/api/admin/packages?${query}`, {
    cache: 'no-store',
    headers: requestHeaders,
  });

  if (!response.ok) {
    throw new Error('Failed to load packages');
  }

  return (await response.json()) as PackagesResponse;
}

function PackagesTableSkeleton() {
  return (
    <div className="border rounded-lg">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Featured</TableHead>
            <TableHead>Publisher</TableHead>
            <TableHead>Versions</TableHead>
            <TableHead>Downloads</TableHead>
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
                <div className="h-4 w-20 bg-muted rounded animate-pulse" />
              </TableCell>
              <TableCell>
                <div className="h-4 w-16 bg-muted rounded animate-pulse" />
              </TableCell>
              <TableCell>
                <div className="h-4 w-32 bg-muted rounded animate-pulse" />
              </TableCell>
              <TableCell>
                <div className="h-4 w-12 bg-muted rounded animate-pulse" />
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

async function PackagesTable({ searchParams }: { searchParams: SearchParams }) {
  try {
    const data = await fetchPackages(searchParams);
    const currentPage = data.page;
    const totalPages = data.totalPages;
    const search = searchParams.search?.trim() ?? '';
    const status = searchParams.status ?? 'all';
    const featured = searchParams.featured ?? 'all';

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
              placeholder="Package name"
              defaultValue={search}
            />
          </div>
          <div className="w-full sm:w-44">
            <label className="text-xs font-medium text-muted-foreground" htmlFor="status">
              Status
            </label>
            <select
              id="status"
              name="status"
              defaultValue={status}
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs"
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="w-full sm:w-44">
            <label className="text-xs font-medium text-muted-foreground" htmlFor="featured">
              Featured
            </label>
            <select
              id="featured"
              name="featured"
              defaultValue={featured}
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs"
            >
              {FEATURED_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            <Button type="submit">Apply</Button>
            <Button variant="outline" asChild>
              <Link href="/admin/packages">Reset</Link>
            </Button>
          </div>
        </form>

        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Featured</TableHead>
                <TableHead>Publisher</TableHead>
                <TableHead>Versions</TableHead>
                <TableHead>Downloads</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.packages.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    No packages found.
                  </TableCell>
                </TableRow>
              ) : (
                data.packages.map((pkg) => (
                  <TableRow key={pkg.id} className="hover:bg-muted/40">
                    <TableCell>
                      <Link href={`/admin/packages/${encodeURIComponent(pkg.name)}`} className="block">
                        <div className="font-medium text-foreground">{pkg.name}</div>
                        {pkg.description && (
                          <div className="text-xs text-muted-foreground truncate max-w-xs">
                            {pkg.description}
                          </div>
                        )}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Link href={`/admin/packages/${encodeURIComponent(pkg.name)}`} className="block">
                        <Badge variant={statusVariant(pkg.status)}>
                          {pkg.status}
                        </Badge>
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Link href={`/admin/packages/${encodeURIComponent(pkg.name)}`} className="block">
                        {pkg.featured ? (
                          <Badge variant="default">Featured</Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Link href={`/admin/packages/${encodeURIComponent(pkg.name)}`} className="block text-muted-foreground">
                        {pkg.publisher?.name ?? pkg.publisher?.email ?? 'Unknown'}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Link href={`/admin/packages/${encodeURIComponent(pkg.name)}`} className="block text-muted-foreground">
                        {pkg.versionCount}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Link href={`/admin/packages/${encodeURIComponent(pkg.name)}`} className="block text-muted-foreground">
                        {formatNumber(pkg.downloadCount)}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Link href={`/admin/packages/${encodeURIComponent(pkg.name)}`} className="block text-muted-foreground">
                        {formatDate(pkg.createdAt)}
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
            Showing page {currentPage} of {Math.max(totalPages, 1)} ({data.total} packages)
          </p>
          <div className="flex gap-2">
            {currentPage > 1 ? (
              <Button variant="outline" asChild>
                <Link href={`/admin/packages?${buildQuery(searchParams, currentPage - 1)}`}>
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
                <Link href={`/admin/packages?${buildQuery(searchParams, currentPage + 1)}`}>
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
        {error instanceof Error ? error.message : 'Failed to load packages.'}
      </div>
    );
  }
}

export default async function AdminPackagesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const resolvedSearchParams = await searchParams;
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Packages</h1>
          <p className="text-muted-foreground mt-1">
            Search, filter, and moderate published packages.
          </p>
        </div>
        <RescanSkillsButton />
      </div>
      <Suspense fallback={<PackagesTableSkeleton />}>
        <PackagesTable searchParams={resolvedSearchParams} />
      </Suspense>
    </div>
  );
}
