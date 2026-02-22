import Link from 'next/link';
import { headers } from 'next/headers';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { auth } from '@/lib/auth';
import { StatusDialog } from './components/status-dialog';

type UserStatus = 'active' | 'suspended' | 'banned';

interface UserDetailsResponse {
  user: {
    id: string;
    name: string | null;
    email: string;
    githubUsername: string | null;
    image: string | null;
    role: 'user' | 'admin';
    createdAt: string;
    updatedAt: string;
  };
  statusHistory: {
    id: string;
    status: UserStatus;
    reason: string | null;
    bannedBy: string | null;
    expiresAt: string | null;
    createdAt: string;
  }[];
  counts: {
    packages: number;
    organizations: number;
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

function statusVariant(status: UserStatus): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (status === 'banned') return 'destructive';
  if (status === 'suspended') return 'outline';
  return 'secondary';
}

async function fetchUserDetails(userId: string): Promise<UserDetailsResponse> {
  const requestHeaders = new Headers(await headers());
  requestHeaders.set('accept', 'application/json');

  const host = requestHeaders.get('host');
  const protocol = requestHeaders.get('x-forwarded-proto') ?? 'http';
  const baseUrl = host ? `${protocol}://${host}` : '';

  const response = await fetch(`${baseUrl}/api/admin/users/${encodeURIComponent(userId)}`, {
    cache: 'no-store',
    headers: requestHeaders,
  });

  if (!response.ok) {
    throw new Error('Failed to load user details.');
  }

  return (await response.json()) as UserDetailsResponse;
}

export default async function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  const data = await fetchUserDetails(userId);

  const currentStatus = (data.statusHistory[0]?.status ?? 'active') as UserStatus;
  const isSelf = session?.user?.id === data.user.id;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{data.user.name ?? 'Unnamed user'}</h1>
          <p className="text-muted-foreground mt-1">{data.user.email}</p>
        </div>
        <ButtonLink href="/admin/users">Back to users</ButtonLink>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription>Role</CardDescription>
            <CardTitle className="capitalize">{data.user.role}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Packages</CardDescription>
            <CardTitle>{data.counts.packages}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Organizations</CardDescription>
            <CardTitle>{data.counts.organizations}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Card>
          <CardHeader>
            <CardTitle>Status history</CardTitle>
            <CardDescription>Most recent moderation events.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.statusHistory.length === 0 ? (
              <p className="text-sm text-muted-foreground">No status changes yet.</p>
            ) : (
              data.statusHistory.map((entry) => (
                <div key={entry.id} className="rounded-md border p-3 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <Badge variant={statusVariant(entry.status)}>{entry.status}</Badge>
                    <span className="text-xs text-muted-foreground">{formatDate(entry.createdAt)}</span>
                  </div>
                  {entry.reason ? (
                    <p className="text-sm text-muted-foreground">{entry.reason}</p>
                  ) : null}
                  {entry.expiresAt ? (
                    <p className="text-xs text-muted-foreground">
                      Expires: {formatDate(entry.expiresAt)}
                    </p>
                  ) : null}
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <StatusDialog
          userId={data.user.id}
          currentRole={data.user.role}
          currentStatus={currentStatus}
          isSelf={isSelf}
        />
      </div>
    </div>
  );
}

function ButtonLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex h-9 items-center justify-center rounded-md border bg-background px-4 text-sm font-medium shadow-xs hover:bg-accent hover:text-accent-foreground"
    >
      {children}
    </Link>
  );
}
