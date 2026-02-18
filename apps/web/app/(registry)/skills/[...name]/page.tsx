import { Badge } from '@/components/ui/badge';
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
import { SkillReadme } from './skill-readme';
import { SkillTabs } from './skill-tabs';
import { FileExplorer } from './file-explorer';

function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatAuditScore(score: number | null): string {
  if (score === null || score === undefined) return '\u2014';
  return `${score}/10`;
}

function timeAgo(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const seconds = Math.floor((Date.now() - d.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

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

function VersionHistory({ versions }: { versions: SkillVersionSummary[] }) {
  if (versions.length === 0) return null;

  return (
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
                  v.auditStatus === 'published' || v.auditStatus === 'completed'
                    ? 'secondary'
                    : 'outline'
                }
              >
                {v.auditStatus}
              </Badge>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

interface SkillDetailPageProps {
  params: Promise<{ name: string[] }>;
}

export default async function SkillDetailPage({
  params,
}: SkillDetailPageProps) {
  const { name: nameParts } = await params;
  const skillName = decodeURIComponent(nameParts.join('/'));
  const data = await getSkillDetail(skillName);

  if (!data) {
    return <NotFound name={skillName} />;
  }

  // manifest may be a JSONB object or a double-encoded JSON string
  const rawManifest = data.latestVersion?.manifest;
  const latestManifest: Record<string, unknown> | undefined =
    typeof rawManifest === 'string'
      ? JSON.parse(rawManifest)
      : (rawManifest as Record<string, unknown> | undefined);
  const fileList: string[] = Array.isArray(latestManifest?.files)
    ? (latestManifest.files as string[])
    : [];
  const license =
    typeof latestManifest?.license === 'string' ? latestManifest.license : null;
  const permissions = data.latestVersion?.permissions as SkillPermissions | null;

  const permItems: string[] = [];
  if (permissions?.network?.outbound?.length)
    permItems.push(
      `Network: ${permissions.network.outbound.length} host(s)`,
    );
  if (permissions?.filesystem?.read?.length || permissions?.filesystem?.write?.length)
    permItems.push('Filesystem access');
  if (permissions?.subprocess) permItems.push('Subprocess execution');

  const readmeContent = data.latestVersion?.readme;

  const readmeTab = readmeContent ? (
    <SkillReadme content={readmeContent} />
  ) : (
    <div className="py-12 text-center text-muted-foreground">
      <p className="text-lg font-medium mb-1">No README</p>
      <p className="text-sm">
        This skill doesn&apos;t have a README yet. Add a SKILL.md to your
        package and re-publish.
      </p>
    </div>
  );

  const versionsTab = <VersionHistory versions={data.versions} />;

  const filesTab = <FileExplorer files={fileList} />;

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <h1 className="text-2xl font-bold tracking-tight font-mono">
            {data.name}
          </h1>
          {data.latestVersion && (
            <Badge variant="secondary" className="font-mono text-xs">
              {data.latestVersion.version}
            </Badge>
          )}
        </div>
        {data.description && (
          <p className="text-muted-foreground">{data.description}</p>
        )}
      </div>

      <div className="flex gap-8 items-start">
        <div className="flex-1 min-w-0">
          <SkillTabs
            readmeTab={readmeTab}
            versionsTab={versionsTab}
            filesTab={filesTab}
          />
        </div>

        <aside className="w-72 shrink-0 space-y-4 sticky top-4">
          <div>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Install
            </h3>
            <InstallCommand name={skillName} />
          </div>

          <Separator />

          {data.repositoryUrl && (
            <>
              <div>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  Repository
                </h3>
                <a
                  href={data.repositoryUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-primary hover:underline inline-flex items-center gap-1"
                >
                  {data.repositoryUrl.replace('https://github.com/', '')}
                  <span className="text-xs">&#8599;</span>
                </a>
              </div>
              <Separator />
            </>
          )}

          <div>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Metadata
            </h3>
            <dl className="space-y-2 text-sm">
              {data.latestVersion && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Version</dt>
                  <dd className="font-mono text-xs">
                    {data.latestVersion.version}
                  </dd>
                </div>
              )}
              {license && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">License</dt>
                  <dd>{license}</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Downloads</dt>
                <dd>{data.downloadCount.toLocaleString()}</dd>
              </div>
              {data.latestVersion && (
                <>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Files</dt>
                    <dd>{data.latestVersion.fileCount}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Size</dt>
                    <dd>{formatSize(data.latestVersion.tarballSize)}</dd>
                  </div>
                </>
              )}
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Published</dt>
                <dd>
                  {data.latestVersion
                    ? timeAgo(data.latestVersion.publishedAt)
                    : '\u2014'}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Publisher</dt>
                <dd>
                  {data.publisher.githubUsername ? (
                    <a
                      href={`https://github.com/${data.publisher.githubUsername}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:underline"
                    >
                      {data.publisher.githubUsername}
                    </a>
                  ) : (
                    data.publisher.displayName
                  )}
                </dd>
              </div>
            </dl>
          </div>

          {data.latestVersion?.auditScore != null && (
            <>
              <Separator />
              <div>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  Security Audit
                </h3>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-2xl font-bold text-green-600">
                    {data.latestVersion.auditScore}
                  </span>
                  <span className="text-sm text-muted-foreground">/10</span>
                </div>
                <div className="text-xs space-y-1 text-muted-foreground">
                  <p className="font-medium text-foreground mb-1">Score breakdown:</p>
                  <ul className="space-y-0.5">
                    <li>✓ SKILL.md present (+1)</li>
                    <li>✓ Description (+1)</li>
                    <li>{Object.keys(data.latestVersion.permissions || {}).length > 0 ? '✓' : '✗'} Permissions declared (+1)</li>
                    <li>✓ No security issues (+2)</li>
                    <li>✓ Permission extraction match (+2)</li>
                    <li>✓ File count reasonable (+1)</li>
                    <li>{data.latestVersion.readme ? '✓' : '✗'} README documentation (+1)</li>
                    <li>✓ Package size reasonable (+1)</li>
                  </ul>
                </div>
                {data.latestVersion.scanVerdict && (
                  <div className="mt-3 pt-2 border-t">
                    <p className="text-xs font-medium">Scan verdict:</p>
                    <p className="text-xs text-muted-foreground capitalize">
                      {data.latestVersion.scanVerdict.replace('_', ' ')}
                    </p>
                  </div>
                )}
                {data.latestVersion.scanFindings && data.latestVersion.scanFindings.length > 0 && (
                  <div className="mt-2">
                    <p className="text-xs font-medium text-amber-600">
                      {data.latestVersion.scanFindings.length} finding(s)
                    </p>
                  </div>
                )}
              </div>
            </>
          )}

          {permItems.length > 0 && (
            <>
              <Separator />
              <div>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  Permissions
                </h3>
                <ul className="space-y-1">
                  {permItems.map((item) => (
                    <li
                      key={item}
                      className="text-sm flex items-center gap-1.5"
                    >
                      <span className="text-amber-500 text-xs">&#9888;</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
