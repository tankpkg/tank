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
  role?: string;
  status?: string;
  page?: string;
};

type UserStatus = 'active' | 'suspended' | 'banned';

interface UserItem {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  role: 'user' | 'admin';
  createdAt: string;
  latestStatus: {
    status: UserStatus;
    reason: string | null;
    expiresAt: string | null;
    createdAt: string;
  } | null;
}

interface UsersResponse {
  users: UserItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

const ROLE_OPTIONS = [
  { value: 'all', label: 'All roles' },
  { value: 'user', label: 'User' },
  { value: 'admin', label: 'Admin' },
];

const STATUS_OPTIONS = [
  { value: 'all', label: 'All statuses' },
  { value: 'active', label: 'Active' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'banned', label: 'Banned' },
];

const DEFAULT_LIMIT = 20;
const SKELETON_ROWS = ['row-1', 'row-2', 'row-3', 'row-4', 'row-5', 'row-6'];

function parsePage(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? '1', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function buildQuery(searchParams: SearchParams, pageOverride?: number): string {
  const params = new URLSearchParams();
  const search = searchParams.search?.trim();
  const role = searchParams.role;
  const status = searchParams.status;
  const page = pageOverride ?? parsePage(searchParams.page);

  if (search) params.set('search', search);
  if (role === 'user' || role === 'admin') params.set('role', role);
  if (status === 'active' || status === 'suspended' || status === 'banned') {
    params.set('status', status);
  }
  params.set('page', page.toString());
  params.set('limit', DEFAULT_LIMIT.toString());

  return params.toString();
}

function statusVariant(status: UserStatus): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (status === 'banned') return 'destructive';
  if (status === 'suspended') return 'outline';
  return 'secondary';
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

function initialsFor(user: UserItem): string {
  const source = user.name?.trim() || user.email;
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase();
}

async function fetchUsers(searchParams: SearchParams): Promise<UsersResponse> {
  const requestHeaders = new Headers(await headers());
  requestHeaders.set('accept', 'application/json');

  const host = requestHeaders.get('host');
  const protocol = requestHeaders.get('x-forwarded-proto') ?? 'http';
  const baseUrl = host ? `${protocol}://${host}` : '';
  const query = buildQuery(searchParams);

  const response = await fetch(`${baseUrl}/api/admin/users?${query}`, {
    cache: 'no-store',
    headers: requestHeaders,
  });

  if (!response.ok) {
    throw new Error('Failed to load users');
  }

  return (await response.json()) as UsersResponse;
}

function UsersTableSkeleton() {
  return (
    <div className="border rounded-lg">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Avatar</TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Created</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {SKELETON_ROWS.map((rowId) => (
            <TableRow key={rowId}>
              <TableCell>
                <div className="size-9 rounded-full bg-muted animate-pulse" />
              </TableCell>
              <TableCell>
                <div className="h-4 w-32 bg-muted rounded animate-pulse" />
              </TableCell>
              <TableCell>
                <div className="h-4 w-40 bg-muted rounded animate-pulse" />
              </TableCell>
              <TableCell>
                <div className="h-4 w-16 bg-muted rounded animate-pulse" />
              </TableCell>
              <TableCell>
                <div className="h-4 w-20 bg-muted rounded animate-pulse" />
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

async function UsersTable({ searchParams }: { searchParams: SearchParams }) {
  try {
    const data = await fetchUsers(searchParams);
    const currentPage = data.page;
    const totalPages = data.totalPages;
    const search = searchParams.search?.trim() ?? '';
    const role = searchParams.role ?? 'all';
    const status = searchParams.status ?? 'all';

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
              placeholder="Name or email"
              defaultValue={search}
            />
          </div>
          <div className="w-full sm:w-44">
            <label className="text-xs font-medium text-muted-foreground" htmlFor="role">
              Role
            </label>
            <select
              id="role"
              name="role"
              defaultValue={role}
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs"
            >
              {ROLE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
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
          <div className="flex gap-2">
            <Button type="submit">Apply</Button>
            <Button variant="outline" asChild>
              <Link href="/admin/users">Reset</Link>
            </Button>
          </div>
        </form>

        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Avatar</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.users.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    No users found.
                  </TableCell>
                </TableRow>
              ) : (
                data.users.map((user) => {
                  const statusValue = user.latestStatus?.status ?? 'active';
                  return (
                    <TableRow key={user.id} className="hover:bg-muted/40">
                      <TableCell>
                        <Link href={`/admin/users/${user.id}`} className="flex items-center gap-3">
                          {user.image ? (
                            <img
                              src={user.image}
                              alt={user.name ?? user.email}
                              className="size-9 rounded-full object-cover"
                            />
                          ) : (
                            <div className="size-9 rounded-full bg-muted flex items-center justify-center text-xs font-semibold">
                              {initialsFor(user)}
                            </div>
                          )}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Link href={`/admin/users/${user.id}`} className="block">
                          <div className="font-medium text-foreground">
                            {user.name ?? 'Unnamed user'}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {user.email}
                          </div>
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Link href={`/admin/users/${user.id}`} className="block text-muted-foreground">
                          {user.email}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Link href={`/admin/users/${user.id}`} className="block capitalize">
                          {user.role}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Link href={`/admin/users/${user.id}`} className="block">
                          <Badge variant={statusVariant(statusValue)}>
                            {statusValue}
                          </Badge>
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Link href={`/admin/users/${user.id}`} className="block text-muted-foreground">
                          {formatDate(user.createdAt)}
                        </Link>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Showing page {currentPage} of {Math.max(totalPages, 1)} ({data.total} users)
          </p>
          <div className="flex gap-2">
            {currentPage > 1 ? (
              <Button variant="outline" asChild>
                <Link href={`/admin/users?${buildQuery(searchParams, currentPage - 1)}`}>
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
                <Link href={`/admin/users?${buildQuery(searchParams, currentPage + 1)}`}>
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
        {error instanceof Error ? error.message : 'Failed to load users.'}
      </div>
    );
  }
}

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const resolvedSearchParams = await searchParams;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Users</h1>
        <p className="text-muted-foreground mt-1">
          Search, filter, and manage registered users.
        </p>
      </div>
      <Suspense fallback={<UsersTableSkeleton />}>
        <UsersTable searchParams={resolvedSearchParams} />
      </Suspense>
    </div>
  );
}
