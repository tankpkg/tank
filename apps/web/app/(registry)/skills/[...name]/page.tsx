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
import { InstallCommand } from './install-command';

// ── Types ────────────────────────────────────────────────────────────────────

interface SkillMetadata {
  name: string;
  description: string;
  latestVersion: string | null;
  publisher: { displayName: string };
  createdAt: string;
  updatedAt: string;
}

interface VersionDetails {
  name: string;
  version: string;
  description: string;
  integrity: string;
  permissions: {
    network?: { outbound?: string[] };
    filesystem?: { read?: string[]; write?: string[] };
    subprocess?: boolean;
  } | null;
  auditScore: number | null;
  auditStatus: string;
  downloadUrl: string;
  publishedAt: string;
  downloads: number;
}

interface VersionSummary {
  version: string;
  integrity: string;
  auditScore: number | null;
  auditStatus: string;
  publishedAt: string;
}

interface VersionsResponse {
  name: string;
  versions: VersionSummary[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
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

function PermissionsSection({
  permissions,
}: {
  permissions: NonNullable<VersionDetails['permissions']>;
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

function VersionHistory({ versions }: { versions: VersionSummary[] }) {
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
  // Reconstruct skill name from path segments
  // /skills/@org/skill-name → ['@org', 'skill-name'] → '@org/skill-name'
  // /skills/my-skill → ['my-skill'] → 'my-skill'
  const skillName = nameParts.join('/');

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  const encodedName = encodeURIComponent(skillName);

  // Fetch skill metadata and versions list in parallel
  const [metaRes, versionsRes] = await Promise.all([
    fetch(`${baseUrl}/api/v1/skills/${encodedName}`, { cache: 'no-store' }),
    fetch(`${baseUrl}/api/v1/skills/${encodedName}/versions`, {
      cache: 'no-store',
    }),
  ]);

  if (!metaRes.ok) {
    return <NotFound name={skillName} />;
  }

  const metadata: SkillMetadata = await metaRes.json();
  const versionsData: VersionsResponse = versionsRes.ok
    ? await versionsRes.json()
    : { name: skillName, versions: [] };

  // Fetch latest version details for permissions
  let versionDetails: VersionDetails | null = null;
  if (metadata.latestVersion) {
    const versionRes = await fetch(
      `${baseUrl}/api/v1/skills/${encodedName}/${metadata.latestVersion}`,
      { cache: 'no-store' },
    );
    if (versionRes.ok) {
      versionDetails = await versionRes.json();
    }
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">{skillName}</h1>
        {metadata.description && (
          <p className="text-muted-foreground mt-2 text-lg">
            {metadata.description}
          </p>
        )}
        <div className="flex items-center gap-3 mt-4 flex-wrap">
          {metadata.latestVersion && (
            <Badge variant="secondary">v{metadata.latestVersion}</Badge>
          )}
          {metadata.publisher?.displayName && (
            <span className="text-sm text-muted-foreground">
              by {metadata.publisher.displayName}
            </span>
          )}
          {versionDetails && (
            <span className="text-sm text-muted-foreground">
              {versionDetails.downloads.toLocaleString()} downloads
            </span>
          )}
        </div>
      </div>

      {/* Install command */}
      <InstallCommand name={skillName} />

      <Separator className="my-8" />

      {/* Audit score highlight */}
      {versionDetails?.auditScore !== null &&
        versionDetails?.auditScore !== undefined && (
          <div className="mb-8 flex items-center gap-3">
            <span className="text-sm font-medium text-muted-foreground">
              Audit Score
            </span>
            <span className="text-2xl font-bold">
              {versionDetails.auditScore}
              <span className="text-sm font-normal text-muted-foreground">
                /10
              </span>
            </span>
          </div>
        )}

      {/* Permissions */}
      {versionDetails?.permissions && (
        <PermissionsSection permissions={versionDetails.permissions} />
      )}

      {/* Version History */}
      <VersionHistory versions={versionsData.versions ?? []} />
    </div>
  );
}
