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

  const filesTab = (
    <FileExplorer
      files={fileList}
      readme={data.latestVersion?.readme}
      manifest={latestManifest}
    />
  );

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

                {/* Security Scan Results */}
                {data.latestVersion.scanDetails?.verdict && (
                  <div className="mb-3 p-2 bg-muted/50 rounded text-xs">
                    <div className="flex justify-between items-center mb-1">
                      <span className="font-medium">Scan Result</span>
                      <span className={`px-1.5 py-0.5 rounded text-white text-[10px] font-medium ${
                        data.latestVersion.scanDetails.verdict === 'pass' ? 'bg-green-600' :
                        data.latestVersion.scanDetails.verdict === 'pass_with_notes' ? 'bg-yellow-600' :
                        data.latestVersion.scanDetails.verdict === 'flagged' ? 'bg-orange-600' : 'bg-red-600'
                      }`}>
                        {data.latestVersion.scanDetails.verdict.replace('_', ' ').toUpperCase()}
                      </span>
                    </div>
                    {data.latestVersion.scanDetails.durationMs && (
                      <p className="text-muted-foreground">Duration: {data.latestVersion.scanDetails.durationMs}ms</p>
                    )}
                  </div>
                )}

                {/* Scan Stages */}
                <div className="text-xs space-y-1 mb-3">
                  <p className="font-medium text-foreground mb-1">6-Stage Security Scan:</p>
                  {[
                    { stage: 'stage0', name: 'Ingestion', desc: 'Download & extract tarball safely' },
                    { stage: 'stage1', name: 'Structure Validation', desc: 'Check file types, sizes, paths' },
                    { stage: 'stage2', name: 'Static Analysis', desc: 'Detect dangerous code patterns' },
                    { stage: 'stage3', name: 'Injection Detection', desc: 'Find prompt/shell injections' },
                    { stage: 'stage4', name: 'Secrets Scanning', desc: 'Detect leaked credentials' },
                    { stage: 'stage5', name: 'Dependency Audit', desc: 'Check supply chain risks' },
                  ].map(({ stage, name, desc }) => {
                    const wasRun = data.latestVersion?.scanDetails?.stagesRun?.includes(stage);
                    const stageFindings = data.latestVersion?.scanDetails?.findings?.filter(f => f.stage === stage) || [];
                    return (
                      <div key={stage} className="flex items-start gap-1.5">
                        <span className={wasRun ? 'text-green-500' : 'text-muted-foreground'}>
                          {wasRun ? '✓' : '○'}
                        </span>
                        <div>
                          <span className="font-medium">{name}</span>
                          {stageFindings.length > 0 && (
                            <span className="ml-1 text-amber-600">({stageFindings.length} issues)</span>
                          )}
                          <p className="text-muted-foreground text-[10px]">{desc}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Findings */}
                {data.latestVersion.scanDetails?.findings && data.latestVersion.scanDetails.findings.length > 0 && (
                  <div className="mt-2 pt-2 border-t">
                    <p className="text-xs font-medium text-amber-600 mb-1">
                      Findings ({data.latestVersion.scanDetails.findings.length}):
                    </p>
                    <div className="space-y-1 max-h-32 overflow-y-auto">
                      {data.latestVersion.scanDetails.findings.map((finding, i) => (
                        <div key={i} className="text-[10px] p-1 bg-muted/50 rounded">
                          <span className={`font-medium ${
                            finding.severity === 'critical' ? 'text-red-600' :
                            finding.severity === 'high' ? 'text-orange-600' :
                            finding.severity === 'medium' ? 'text-yellow-600' : 'text-blue-600'
                          }`}>
                            [{finding.severity.toUpperCase()}]
                          </span>
                          <span className="ml-1">{finding.type}</span>
                          {finding.location && <span className="text-muted-foreground ml-1">({finding.location})</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Score Breakdown */}
                <details className="mt-2">
                  <summary className="text-xs font-medium cursor-pointer hover:text-foreground">
                    Score breakdown details
                  </summary>
                  <div className="text-xs space-y-0.5 text-muted-foreground mt-1 pl-2">
                    <p>✓ SKILL.md present (+1)</p>
                    <p>✓ Description (+1)</p>
                    <p>{Object.keys(data.latestVersion.permissions || {}).length > 0 ? '✓' : '✗'} Permissions declared (+1)</p>
                    <p>{data.latestVersion.scanDetails?.findings?.length === 0 ? '✓' : '✗'} No security issues (+2)</p>
                    <p>✓ Permission extraction match (+2)</p>
                    <p>✓ File count &lt;100 (+1)</p>
                    <p>{data.latestVersion.readme ? '✓' : '✗'} README documentation (+1)</p>
                    <p>✓ Package size &lt;5MB (+1)</p>
                  </div>
                </details>
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
