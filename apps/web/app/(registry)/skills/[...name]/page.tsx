import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { getSkillDetail } from '@/lib/data/skills';
import type { SkillVersionSummary } from '@/lib/data/skills';
import { InstallCommand } from './install-command';

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatAuditScore(score: number | null): string {
  if (score === null || score === undefined) return '—';
  return `${score}/10`;
}

// ── Sub-components (Server) ──────────────────────────────────────────────────

function NotFound({ name }: { name: string }) {
  return (
    <div className="max-w-4xl mx-auto py-16 text-center">
      <h1 className="text-2xl font-bold mb-2">Skill not found</h1>
      <p className="text-muted-foreground">
        <code className="rounded bg-muted px-2 py-1 text-sm font-mono">
          {name}
        </code>{' '}
        doesn&apos;t exist or hasn&apos;t been published yet.
      </p>
    </div>
  );
}

interface SkillPermissions {
  network?: { outbound?: string[] };
  filesystem?: { read?: string[]; write?: string[] };
  subprocess?: boolean;
}

function PermissionsSection({
  permissions,
}: {
  permissions: SkillPermissions;
}) {
  const networkHosts = permissions.network?.outbound ?? [];
  const fsRead = permissions.filesystem?.read ?? [];
  const fsWrite = permissions.filesystem?.write ?? [];
  const subprocess = permissions.subprocess ?? false;

  const hasAny =
    networkHosts.length > 0 ||
    fsRead.length > 0 ||
    fsWrite.length > 0 ||
    subprocess;

  if (!hasAny) return null;

  return (
    <Card className="mb-8">
      <CardHeader>
        <CardTitle className="text-lg">Permissions</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-3 text-sm">
          {networkHosts.length > 0 && (
            <div className="flex gap-4">
              <dt className="w-28 shrink-0 font-medium text-muted-foreground">
                Network
              </dt>
              <dd className="font-mono text-xs flex flex-wrap gap-1.5">
                {networkHosts.map((host) => (
                  <Badge key={host} variant="secondary">
                    {host}
                  </Badge>
                ))}
              </dd>
            </div>
          )}

          {(fsRead.length > 0 || fsWrite.length > 0) && (
            <div className="flex gap-4">
              <dt className="w-28 shrink-0 font-medium text-muted-foreground">
                Filesystem
              </dt>
              <dd className="flex flex-col gap-1">
                {fsRead.map((p) => (
                  <span key={`r-${p}`} className="font-mono text-xs">
                    {p}{' '}
                    <Badge variant="outline" className="ml-1 text-[10px]">
                      read
                    </Badge>
                  </span>
                ))}
                {fsWrite.map((p) => (
                  <span key={`w-${p}`} className="font-mono text-xs">
                    {p}{' '}
                    <Badge variant="outline" className="ml-1 text-[10px]">
                      write
                    </Badge>
                  </span>
                ))}
              </dd>
            </div>
          )}

          <div className="flex gap-4">
            <dt className="w-28 shrink-0 font-medium text-muted-foreground">
              Subprocess
            </dt>
            <dd className="text-sm">
              {subprocess ? (
                <Badge variant="destructive">Yes</Badge>
              ) : (
                <span className="text-muted-foreground">No</span>
              )}
            </dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
}

function VersionHistory({ versions }: { versions: SkillVersionSummary[] }) {
  if (versions.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Version History</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Version</TableHead>
              <TableHead>Published</TableHead>
              <TableHead>Audit Score</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {versions.map((v) => (
              <TableRow key={v.version}>
                <TableCell className="font-mono font-medium">
                  {v.version}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {formatDate(v.publishedAt)}
                </TableCell>
                <TableCell>{formatAuditScore(v.auditScore)}</TableCell>
                <TableCell>
                  <Badge
                    variant={
                      v.auditStatus === 'published' ? 'secondary' : 'outline'
                    }
                  >
                    {v.auditStatus}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

interface SkillDetailPageProps {
  params: Promise<{ name: string[] }>;
}

export default async function SkillDetailPage({
  params,
}: SkillDetailPageProps) {
  const { name: nameParts } = await params;
  // /skills/%40org/skill-name → ['%40org', 'skill-name'] → '@org/skill-name'
  const skillName = decodeURIComponent(nameParts.join('/'));

  // Single direct DB call — 2 parallel queries, no HTTP self-fetch
  const data = await getSkillDetail(skillName);

  if (!data) {
    return <NotFound name={skillName} />;
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">{data.name}</h1>
        {data.description && (
          <p className="text-muted-foreground mt-2 text-lg">
            {data.description}
          </p>
        )}
        <div className="flex items-center gap-3 mt-4 flex-wrap">
          {data.latestVersion && (
            <Badge variant="secondary">v{data.latestVersion.version}</Badge>
          )}
          {data.publisher?.displayName && (
            <span className="text-sm text-muted-foreground">
              by {data.publisher.displayName}
            </span>
          )}
          <span className="text-sm text-muted-foreground">
            {data.downloadCount.toLocaleString()} downloads
          </span>
        </div>
      </div>

      {/* Install command */}
      <InstallCommand name={skillName} />

      <Separator className="my-8" />

      {/* Audit score highlight */}
      {data.latestVersion?.auditScore != null && (
        <div className="mb-8 flex items-center gap-3">
          <span className="text-sm font-medium text-muted-foreground">
            Audit Score
          </span>
          <span className="text-2xl font-bold">
            {data.latestVersion.auditScore}
            <span className="text-sm font-normal text-muted-foreground">
              /10
            </span>
          </span>
        </div>
      )}

      {/* Permissions */}
      {data.latestVersion?.permissions && (
        <PermissionsSection
          permissions={data.latestVersion.permissions as SkillPermissions}
        />
      )}

      {/* Version History */}
      <VersionHistory versions={data.versions} />
    </div>
  );
}
