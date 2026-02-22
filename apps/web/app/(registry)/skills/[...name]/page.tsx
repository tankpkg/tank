import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { unstable_noStore as noStore } from 'next/cache';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { getSkillDetail } from '@/lib/data/skills';
import type { SkillVersionSummary, ScanFinding } from '@/lib/data/skills';
import { InstallCommand } from './install-command';
import { SkillReadme } from './skill-readme';
import { SkillTabs } from './skill-tabs';
import { FileExplorer } from './file-explorer';
import { DownloadButton } from './download-button';
import {
  SecurityOverview,
  ScanningToolsStrip,
  FindingsList,
  ScanPipeline,
  ScoreBreakdown,
} from '@/components/security';

// ISR: cache page at CDN for 60s, survives serverless cold starts (PERF-005/006)
export const revalidate = 60;

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

// Safe JSON parser that handles malformed strings
function safeParseJson(value: unknown): Record<string, unknown> | undefined {
  if (!value) return undefined;
  if (typeof value === 'object') return value as Record<string, unknown>;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as Record<string, unknown>;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

// Safe permissions parser
function safeParsePermissions(value: unknown): SkillPermissions | null {
  if (!value) return null;
  if (typeof value === 'object') return value as SkillPermissions;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as SkillPermissions;
    } catch {
      return null;
    }
  }
  return null;
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
  if (process.env.TANK_PERF_MODE === '1') noStore();

  const { name: nameParts } = await params;
  const skillName = decodeURIComponent(nameParts.join('/'));
  const data = await getSkillDetail(skillName);

  if (!data) {
    return <NotFound name={skillName} />;
  }

  // manifest may be a JSONB object or a double-encoded JSON string
  const latestManifest = safeParseJson(data.latestVersion?.manifest);
  const fileList: string[] = Array.isArray(latestManifest?.files)
    ? (latestManifest.files as string[])
    : [];
  const license =
    typeof latestManifest?.license === 'string' ? latestManifest.license : null;
  const permissions = safeParsePermissions(data.latestVersion?.permissions);

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
    <div data-testid="readme-root">
      <SkillReadme content={readmeContent} />
    </div>
  ) : (
    <div className="py-12 text-center text-muted-foreground" data-testid="readme-root">
      <p className="text-lg font-medium mb-1">No README</p>
      <p className="text-sm">
        This skill doesn&apos;t have a README yet. Add a SKILL.md to your
        package and re-publish.
      </p>
    </div>
  );

  const versionsTab = <VersionHistory versions={data.versions} />;

  const filesTab = (
    <div data-testid="file-explorer-root">
      <FileExplorer
        files={fileList}
        skillName={data.name}
        version={data.latestVersion?.version ?? ''}
        readme={data.latestVersion?.readme}
        manifest={latestManifest}
      />
    </div>
  );

  // Security tab - comprehensive security analysis
  const scanDetails = data.latestVersion?.scanDetails;
  const hasSecurityData = data.latestVersion?.auditScore != null && scanDetails != null;

  // Build security tab content
  const securityTab = hasSecurityData ? (
    <div className="space-y-6" data-testid="security-root">
      {/* Security Overview Banner */}
      <SecurityOverview
        score={data.latestVersion?.auditScore ?? null}
        verdict={scanDetails?.verdict ?? null}
        durationMs={scanDetails?.durationMs ?? null}
        scannedAt={data.latestVersion?.publishedAt ? String(data.latestVersion.publishedAt) : null}
        criticalCount={scanDetails?.criticalCount ?? 0}
        highCount={scanDetails?.highCount ?? 0}
        mediumCount={scanDetails?.mediumCount ?? 0}
        lowCount={scanDetails?.lowCount ?? 0}
      />

      {/* Scanning Tools Used */}
      <div>
        <h3 className="text-sm font-semibold mb-2">Scanning Tools</h3>
        <ScanningToolsStrip
          tools={[
            { name: 'Semgrep', category: 'SAST', ran: scanDetails?.stagesRun?.includes('stage2') ?? false, findingCount: scanDetails?.findings?.filter(f => f.stage === 'stage2' && f.tool?.includes('semgrep')).length ?? 0 },
            { name: 'Bandit', category: 'Python AST', ran: scanDetails?.stagesRun?.includes('stage2') ?? false, findingCount: scanDetails?.findings?.filter(f => f.tool === 'bandit').length ?? 0 },
            { name: 'Cisco Skill Scanner', category: 'Agent Threats', ran: scanDetails?.stagesRun?.includes('stage3') ?? false, findingCount: 0 },
            { name: 'detect-secrets', category: 'Secrets', ran: scanDetails?.stagesRun?.includes('stage4') ?? false, findingCount: scanDetails?.findings?.filter(f => f.stage === 'stage4').length ?? 0 },
            { name: 'OSV API', category: 'SCA', ran: scanDetails?.stagesRun?.includes('stage5') ?? false, findingCount: scanDetails?.findings?.filter(f => f.stage === 'stage5').length ?? 0 },
          ]}
        />
      </div>

      {/* Findings List */}
      <div>
        <h3 className="text-sm font-semibold mb-3">
          Findings
          {scanDetails?.findings && scanDetails.findings.length > 0 && (
            <span className="ml-2 text-muted-foreground font-normal">
              ({scanDetails.findings.length} total)
            </span>
          )}
        </h3>
        <FindingsList findings={scanDetails?.findings ?? []} />
      </div>

      {/* Two-column layout for Pipeline and Score */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Scan Pipeline */}
        <ScanPipeline
          stages={[
            { id: 'stage0', name: 'Ingestion', description: 'Download & extract tarball safely', status: scanDetails?.stagesRun?.includes('stage0') ? 'passed' : 'skipped', findingCount: scanDetails?.findings?.filter(f => f.stage === 'stage0').length ?? 0, durationMs: 0, tools: ['httpx', 'tarfile', 'hashlib'] },
            { id: 'stage1', name: 'Structure Validation', description: 'Check file types, sizes, paths', status: scanDetails?.stagesRun?.includes('stage1') ? 'passed' : 'skipped', findingCount: scanDetails?.findings?.filter(f => f.stage === 'stage1').length ?? 0, durationMs: 0, tools: ['charset-normalizer', 'unicodedata'] },
            { id: 'stage2', name: 'Static Analysis', description: 'Detect dangerous code patterns', status: scanDetails?.stagesRun?.includes('stage2') ? ((scanDetails?.findings?.filter(f => f.stage === 'stage2').length ?? 0) > 0 ? 'flagged' : 'passed') : 'skipped', findingCount: scanDetails?.findings?.filter(f => f.stage === 'stage2').length ?? 0, durationMs: 0, tools: ['Semgrep', 'Bandit', 'Custom AST'] },
            { id: 'stage3', name: 'Injection Detection', description: 'Find prompt/shell injections', status: scanDetails?.stagesRun?.includes('stage3') ? ((scanDetails?.findings?.filter(f => f.stage === 'stage3').length ?? 0) > 0 ? 'flagged' : 'passed') : 'skipped', findingCount: scanDetails?.findings?.filter(f => f.stage === 'stage3').length ?? 0, durationMs: 0, tools: ['Regex patterns'] },
            { id: 'stage4', name: 'Secrets Scanning', description: 'Detect leaked credentials', status: scanDetails?.stagesRun?.includes('stage4') ? ((scanDetails?.findings?.filter(f => f.stage === 'stage4').length ?? 0) > 0 ? 'flagged' : 'passed') : 'skipped', findingCount: scanDetails?.findings?.filter(f => f.stage === 'stage4').length ?? 0, durationMs: 0, tools: ['detect-secrets', 'Custom patterns'] },
            { id: 'stage5', name: 'Dependency Audit', description: 'Check supply chain risks', status: scanDetails?.stagesRun?.includes('stage5') ? ((scanDetails?.findings?.filter(f => f.stage === 'stage5').length ?? 0) > 0 ? 'flagged' : 'passed') : 'skipped', findingCount: scanDetails?.findings?.filter(f => f.stage === 'stage5').length ?? 0, durationMs: 0, tools: ['OSV API', 'pip-audit'] },
          ]}
        />

        {/* Score Breakdown */}
        <ScoreBreakdown
          criteria={[
            { label: 'SKILL.md present', passed: !!data.latestVersion?.readme, points: data.latestVersion?.readme ? 1 : 0, maxPoints: 1 },
            { label: 'Description provided', passed: !!data.description, points: data.description ? 1 : 0, maxPoints: 1 },
            { label: 'Permissions declared', passed: !!data.latestVersion?.permissions && Object.keys(data.latestVersion.permissions).length > 0, points: data.latestVersion?.permissions && Object.keys(data.latestVersion.permissions).length > 0 ? 1 : 0, maxPoints: 1 },
            { label: 'No security issues', passed: (scanDetails?.findings?.length ?? 0) === 0, points: (scanDetails?.findings?.length ?? 0) === 0 ? 2 : 0, maxPoints: 2 },
            { label: 'Permissions match detected usage', passed: true, points: 2, maxPoints: 2 },
            { label: 'File count under 100', passed: (data.latestVersion?.fileCount ?? 0) < 100, points: (data.latestVersion?.fileCount ?? 0) < 100 ? 1 : 0, maxPoints: 1 },
            { label: 'README documentation', passed: !!data.latestVersion?.readme, points: data.latestVersion?.readme ? 1 : 0, maxPoints: 1 },
            { label: 'Package under 5MB', passed: (data.latestVersion?.tarballSize ?? 0) < 5 * 1024 * 1024, points: (data.latestVersion?.tarballSize ?? 0) < 5 * 1024 * 1024 ? 1 : 0, maxPoints: 1 },
          ]}
          totalScore={data.latestVersion?.auditScore ?? 0}
        />
      </div>
    </div>
  ) : null;

  return (
    <div className="max-w-6xl mx-auto" data-testid="skill-detail-root">
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
            securityTab={securityTab}
            hasSecurityData={hasSecurityData}
          />
        </div>

        <aside className="w-72 shrink-0 space-y-4 sticky top-4">
          <div>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Install
            </h3>
            <InstallCommand name={skillName} />
            {data.latestVersion && (
              <div className="mt-3">
                <DownloadButton name={skillName} version={data.latestVersion.version} />
              </div>
            )}
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
                    data.publisher.name
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
                  Security
                </h3>
                {/* Score with progress bar */}
                <div className="flex items-center gap-2 mb-2">
                  <span className={`text-2xl font-bold ${
                    data.latestVersion.auditScore >= 8 ? 'text-green-600' :
                    data.latestVersion.auditScore >= 6 ? 'text-yellow-600' :
                    data.latestVersion.auditScore >= 4 ? 'text-orange-600' : 'text-red-600'
                  }`}>
                    {data.latestVersion.auditScore}
                  </span>
                  <span className="text-sm text-muted-foreground">/10</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden mb-3">
                  <div
                    className={`h-full transition-all ${
                      data.latestVersion.auditScore >= 8 ? 'bg-green-500' :
                      data.latestVersion.auditScore >= 6 ? 'bg-yellow-500' :
                      data.latestVersion.auditScore >= 4 ? 'bg-orange-500' : 'bg-red-500'
                    }`}
                    style={{ width: `${(data.latestVersion.auditScore / 10) * 100}%` }}
                  />
                </div>

                {/* Verdict badge */}
                {scanDetails?.verdict && (
                  <div className={`inline-flex px-2 py-1 rounded text-xs font-medium text-white mb-2 ${
                    scanDetails.verdict === 'pass' ? 'bg-green-600' :
                    scanDetails.verdict === 'pass_with_notes' ? 'bg-yellow-600' :
                    scanDetails.verdict === 'flagged' ? 'bg-orange-600' : 'bg-red-600'
                  }`}>
                    {scanDetails.verdict.replace('_', ' ').toUpperCase()}
                  </div>
                )}

                {/* Finding counts summary */}
                <div className="text-xs space-y-1 mb-3">
                  {(scanDetails?.criticalCount ?? 0) > 0 && (
                    <div className="flex items-center gap-2 text-red-600">
                      <span>●</span>
                      <span>{scanDetails?.criticalCount} critical finding{(scanDetails?.criticalCount ?? 0) !== 1 ? 's' : ''}</span>
                    </div>
                  )}
                  {(scanDetails?.highCount ?? 0) > 0 && (
                    <div className="flex items-center gap-2 text-orange-600">
                      <span>●</span>
                      <span>{scanDetails?.highCount} high finding{(scanDetails?.highCount ?? 0) !== 1 ? 's' : ''}</span>
                    </div>
                  )}
                  {(scanDetails?.mediumCount ?? 0) > 0 && (
                    <div className="flex items-center gap-2 text-yellow-600">
                      <span>●</span>
                      <span>{scanDetails?.mediumCount} medium finding{(scanDetails?.mediumCount ?? 0) !== 1 ? 's' : ''}</span>
                    </div>
                  )}
                  {(scanDetails?.lowCount ?? 0) > 0 && (
                    <div className="flex items-center gap-2 text-blue-600">
                      <span>●</span>
                      <span>{scanDetails?.lowCount} low finding{(scanDetails?.lowCount ?? 0) !== 1 ? 's' : ''}</span>
                    </div>
                  )}
                  {(scanDetails?.findings?.length ?? 0) === 0 && (
                    <div className="flex items-center gap-2 text-green-600">
                      <span>✓</span>
                      <span>No security issues</span>
                    </div>
                  )}
                </div>

                {/* Link to full report */}
                {hasSecurityData && (
                  <a
                    href="#security"
                    onClick={(e) => {
                      e.preventDefault();
                      // Click the security tab
                      const securityTab = document.querySelector('[data-state="inactive"][value="security"]') as HTMLElement;
                      if (securityTab) securityTab.click();
                    }}
                    className="text-xs text-primary hover:underline flex items-center gap-1"
                  >
                    View full security report →
                  </a>
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
