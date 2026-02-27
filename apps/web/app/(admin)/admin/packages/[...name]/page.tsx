import Link from 'next/link';
import { notFound } from 'next/navigation';
import { eq, desc, sql, and, gte } from 'drizzle-orm';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { db } from '@/lib/db';
import { skills, skillVersions, skillDownloadDaily, auditEvents } from '@/lib/db/schema';
import { user } from '@/lib/db/auth-schema';
import { FeatureButton } from './components/feature-button';
import { StatusDialog } from './components/status-dialog';
import { ForceDeleteCard } from './components/force-delete-card';
import { DeleteVersionButton } from './components/delete-version-button';
import { PublisherBanDeleteButton } from './components/publisher-ban-delete-button';
import { VisibilityCard } from './components/visibility-card';
import { AccessGrantsCard } from './components/access-grants-card';

type PackageStatus = 'active' | 'deprecated' | 'quarantined' | 'removed';

function formatDate(date: Date | string | null): string {
  if (!date) return '—';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function statusVariant(
  status: PackageStatus,
): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (status === 'removed') return 'destructive';
  if (status === 'quarantined') return 'outline';
  if (status === 'deprecated') return 'secondary';
  return 'default';
}

function visibilityVariant(
  visibility: string | null,
): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (visibility === 'private') return 'secondary';
  return 'default';
}

function BackLink() {
  return (
    <Link href="/admin/packages" className="text-sm text-muted-foreground hover:underline">
      ← Back to packages
    </Link>
  );
}

export default async function AdminPackageDetailPage({
  params,
}: {
  params: Promise<{ name: string[] }>;
}) {
  const { name: nameSegments } = await params;
  const name = nameSegments.map((segment) => {
    try {
      return decodeURIComponent(segment);
    } catch {
      return segment;
    }
  }).join('/');

  const [skill] = await db
    .select()
    .from(skills)
    .where(eq(skills.name, name))
    .limit(1);

  if (!skill) {
    notFound();
  }

  const publisherResult = skill.publisherId
    ? await db
        .select({
          id: user.id,
          name: user.name,
          email: user.email,
          githubUsername: user.githubUsername,
        })
        .from(user)
        .where(eq(user.id, skill.publisherId))
        .limit(1)
    : [];

  const publisher = publisherResult[0] ?? null;

  const versions = await db
    .select({
      id: skillVersions.id,
      version: skillVersions.version,
      createdAt: skillVersions.createdAt,
      auditStatus: skillVersions.auditStatus,
    })
    .from(skillVersions)
    .where(eq(skillVersions.skillId, skill.id))
    .orderBy(desc(skillVersions.createdAt));

  const downloadCountResult = await db
    .select({ count: sql<number>`COALESCE(SUM(${skillDownloadDaily.count}), 0)::int` })
    .from(skillDownloadDaily)
    .where(and(
      eq(skillDownloadDaily.skillId, skill.id),
      gte(skillDownloadDaily.date, sql`CURRENT_DATE - INTERVAL '7 days'`),
    ));
  const downloadCount = downloadCountResult[0]?.count ?? 0;

  const statusHistory = await db
    .select()
    .from(auditEvents)
    .where(
      and(
        eq(auditEvents.targetId, skill.id),
        eq(auditEvents.targetType, 'skill'),
      ),
    )
    .orderBy(desc(auditEvents.createdAt))
    .limit(50);

  const status = (skill.status ?? 'active') as PackageStatus;

  return (
    <div className="space-y-6">
      <BackLink />

      <div>
        <h1 className="text-2xl font-bold">{name}</h1>
        {skill.description ? (
          <p className="mt-1 text-muted-foreground">{skill.description}</p>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Status</CardDescription>
          </CardHeader>
          <CardContent>
            <Badge variant={statusVariant(status)}>{status}</Badge>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Downloads</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{downloadCount}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Versions</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{versions.length}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Visibility</CardDescription>
          </CardHeader>
          <CardContent>
            <Badge variant={visibilityVariant(skill.visibility)}>{skill.visibility ?? 'public'}</Badge>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Featured</CardDescription>
          </CardHeader>
          <CardContent>
            <Badge variant={skill.featured ? 'default' : 'secondary'}>
              {skill.featured ? 'Yes' : 'No'}
            </Badge>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Versions</CardTitle>
            </CardHeader>
            <CardContent>
              {versions.length === 0 ? (
                <p className="text-sm text-muted-foreground">No versions published yet.</p>
              ) : (
                <div className="space-y-3">
                  {versions.map((v) => (
                    <div
                      key={v.id}
                      className="flex items-center justify-between rounded border p-3"
                    >
                      <div>
                        <p className="font-mono text-sm font-medium">{v.version}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(v.createdAt)}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge variant="outline">{v.auditStatus ?? 'unknown'}</Badge>
                        <DeleteVersionButton packageName={name} version={v.version} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Audit history</CardTitle>
            </CardHeader>
            <CardContent>
              {statusHistory.length === 0 ? (
                <p className="text-sm text-muted-foreground">No status changes recorded.</p>
              ) : (
                <div className="space-y-2">
                  {statusHistory.map((entry) => (
                    <div key={entry.id} className="rounded border p-3 text-sm">
                      <div className="flex items-center justify-between">
                        <Badge variant="outline">{entry.action}</Badge>
                        <span className="text-xs text-muted-foreground">
                          {formatDate(entry.createdAt)}
                        </span>
                      </div>
                      {entry.metadata &&
                      typeof entry.metadata === 'object' &&
                      'reason' in entry.metadata ? (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {String((entry.metadata as Record<string, unknown>).reason)}
                        </p>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <StatusDialog packageName={name} currentStatus={status} />

          <VisibilityCard packageName={name} currentVisibility={(skill.visibility === 'private' ? 'private' : 'public')} />

          <AccessGrantsCard packageName={name} />

          <ForceDeleteCard packageName={name} />

          <Card>
            <CardHeader>
              <CardTitle>Featured</CardTitle>
            </CardHeader>
            <CardContent>
              <FeatureButton packageName={name} featured={skill.featured ?? false} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Publisher</CardTitle>
            </CardHeader>
            <CardContent>
              {publisher ? (
                <div className="space-y-1 text-sm">
                  <p className="font-medium">{publisher.name ?? '—'}</p>
                  <p className="text-muted-foreground">{publisher.email ?? '—'}</p>
                  {publisher.githubUsername ? (
                    <p className="text-muted-foreground">@{publisher.githubUsername}</p>
                  ) : null}
                  <PublisherBanDeleteButton packageName={name} publisherId={publisher.id} />
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Unknown publisher</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Metadata</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <p>
                <span className="text-muted-foreground">Created:</span>{' '}
                {formatDate(skill.createdAt)}
              </p>
              <p>
                <span className="text-muted-foreground">Updated:</span>{' '}
                {formatDate(skill.updatedAt)}
              </p>
              <p>
                <span className="text-muted-foreground">ID:</span>{' '}
                <span className="font-mono text-xs">{skill.id}</span>
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
