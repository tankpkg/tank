import Link from 'next/link';
import { count, desc, eq, inArray } from 'drizzle-orm';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { db } from '@/lib/db';
import { auditEvents, skills, user, userStatus } from '@/lib/db/schema';

export const dynamic = 'force-dynamic';

async function getMetrics() {
  const [userCount] = await db.select({ value: count() }).from(user);
  const [packageCount] = await db.select({ value: count() }).from(skills);
  const [quarantinedCount] = await db
    .select({ value: count() })
    .from(skills)
    .where(eq(skills.status, 'quarantined'));
  const [bannedCount] = await db
    .select({ value: count() })
    .from(userStatus)
    .where(eq(userStatus.status, 'banned'));

  return {
    users: userCount?.value ?? 0,
    packages: packageCount?.value ?? 0,
    quarantined: quarantinedCount?.value ?? 0,
    banned: bannedCount?.value ?? 0,
  };
}

async function getRecentAuditEvents() {
  return db
    .select({
      id: auditEvents.id,
      action: auditEvents.action,
      actorName: user.name,
      actorEmail: user.email,
      targetType: auditEvents.targetType,
      targetId: auditEvents.targetId,
      createdAt: auditEvents.createdAt,
    })
    .from(auditEvents)
    .leftJoin(user, eq(auditEvents.actorId, user.id))
    .orderBy(desc(auditEvents.createdAt))
    .limit(20);
}

async function getFlaggedPackages() {
  return db
    .select({
      id: skills.id,
      name: skills.name,
      status: skills.status,
      statusReason: skills.statusReason,
      updatedAt: skills.updatedAt,
    })
    .from(skills)
    .where(inArray(skills.status, ['quarantined', 'deprecated', 'removed']))
    .orderBy(desc(skills.updatedAt))
    .limit(10);
}

function formatDate(value: Date): string {
  return value.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default async function AdminDashboardPage() {
  const [metrics, recentEvents, flaggedPackages] = await Promise.all([
    getMetrics(),
    getRecentAuditEvents(),
    getFlaggedPackages(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Admin Dashboard</h1>
        <p className="mt-1 text-muted-foreground">
          Monitor moderation activity and high-risk changes.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Users" value={metrics.users} />
        <MetricCard label="Packages" value={metrics.packages} />
        <MetricCard label="Quarantined" value={metrics.quarantined} />
        <MetricCard label="Banned users" value={metrics.banned} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Recent audit events</CardTitle>
            <CardDescription>Latest 20 admin actions across the registry.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {recentEvents.length === 0 ? (
              <p className="text-sm text-muted-foreground">No audit events yet.</p>
            ) : (
              recentEvents.map((event) => (
                <div
                  key={event.id}
                  className="rounded-md border p-3 flex flex-wrap items-center justify-between gap-2"
                >
                  <div>
                    <p className="font-medium">{event.action}</p>
                    <p className="text-xs text-muted-foreground">
                      {event.actorName ?? event.actorEmail ?? 'System'}
                    </p>
                  </div>
                  <div className="text-right text-xs text-muted-foreground">
                    <p>
                      {event.targetType ?? 'n/a'} {event.targetId ?? ''}
                    </p>
                    <p>{formatDate(event.createdAt)}</p>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Flagged packages</CardTitle>
            <CardDescription>Packages with non-active moderation status.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {flaggedPackages.length === 0 ? (
              <p className="text-sm text-muted-foreground">No flagged packages.</p>
            ) : (
              flaggedPackages.map((pkg) => (
                <div
                  key={pkg.id}
                  className="rounded-md border p-3 flex items-center justify-between gap-2"
                >
                  <div>
                    <Link
                      href={`/admin/packages/${encodeURIComponent(pkg.name)}`}
                      className="font-medium"
                    >
                      {pkg.name}
                    </Link>
                    {pkg.statusReason ? (
                      <p className="text-xs text-muted-foreground">{pkg.statusReason}</p>
                    ) : null}
                  </div>
                  <Badge variant={pkg.status === 'quarantined' ? 'destructive' : 'outline'}>
                    {pkg.status}
                  </Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle>{value}</CardTitle>
      </CardHeader>
    </Card>
  );
}
