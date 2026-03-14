import { encodeSkillName } from '@internals/helpers';
import { Star } from 'lucide-react';
import { InstallCommand } from '~/components/skills/install-command';
import { SkillTabs } from '~/components/skills/skill-tabs';
import { Badge } from '~/components/ui/badge';
import { Separator } from '~/components/ui/separator';
import type { LLMAnalysisInfo, ScanFinding, SkillDetailResult } from '~/lib/data/skills';

// ── Utility functions ─────────────────────────────────────────────────────────

function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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

interface SkillPermissions {
  network?: { outbound?: string[] };
  filesystem?: { read?: string[]; write?: string[] };
  subprocess?: boolean;
}

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

// ── Inline security components ────────────────────────────────────────────────

function SecurityOverview({
  score,
  verdict,
  durationMs,
  scannedAt,
  criticalCount,
  highCount,
  mediumCount,
  lowCount,
  llmAnalysis
}: {
  score: number | null;
  verdict: string | null;
  durationMs: number | null;
  scannedAt: string | null;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  llmAnalysis: LLMAnalysisInfo | null;
}) {
  const totalFindings = criticalCount + highCount + mediumCount + lowCount;

  return (
    <div className="rounded-lg border p-4 space-y-3" data-testid="security-overview">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span
            className={`text-3xl font-bold ${
              (score ?? 0) >= 8
                ? 'text-green-600'
                : (score ?? 0) >= 6
                  ? 'text-yellow-600'
                  : (score ?? 0) >= 4
                    ? 'text-orange-600'
                    : 'text-red-600'
            }`}>
            {score !== null ? `${score}/10` : '\u2014'}
          </span>
          {verdict && (
            <span
              className={`inline-flex px-2 py-1 rounded text-xs font-medium text-white ${
                verdict === 'pass'
                  ? 'bg-green-600'
                  : verdict === 'pass_with_notes'
                    ? 'bg-yellow-600'
                    : verdict === 'flagged'
                      ? 'bg-orange-600'
                      : 'bg-red-600'
              }`}>
              {verdict.replace('_', ' ').toUpperCase()}
            </span>
          )}
        </div>
        <div className="text-xs text-muted-foreground text-right space-y-0.5">
          {durationMs != null && <div>Scan duration: {(durationMs / 1000).toFixed(1)}s</div>}
          {scannedAt && <div>Scanned: {formatDate(scannedAt)}</div>}
        </div>
      </div>

      <div className="flex gap-4 text-xs">
        {criticalCount > 0 && <span className="text-red-600">{criticalCount} critical</span>}
        {highCount > 0 && <span className="text-orange-600">{highCount} high</span>}
        {mediumCount > 0 && <span className="text-yellow-600">{mediumCount} medium</span>}
        {lowCount > 0 && <span className="text-blue-600">{lowCount} low</span>}
        {totalFindings === 0 && <span className="text-green-600">No security issues found</span>}
      </div>

      {llmAnalysis?.enabled && (
        <div className="text-xs text-muted-foreground">
          LLM corroboration: {llmAnalysis.mode === 'byollm' ? 'Custom LLM' : 'Built-in'}
          {llmAnalysis.providers?.map((p) => (
            <span key={p.name} className="ml-2">
              {p.name}/{p.model} ({p.status})
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function ScanningToolsStrip({
  tools
}: {
  tools: Array<{
    name: string;
    category: string;
    ran: boolean;
    findingCount: number;
  }>;
}) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
      {tools.map((tool) => (
        <div
          key={tool.name}
          className={`rounded-lg border p-3 text-sm ${tool.ran ? 'bg-background' : 'bg-muted/50 opacity-60'}`}>
          <div className="font-medium truncate">{tool.name}</div>
          <div className="text-xs text-muted-foreground">{tool.category}</div>
          {tool.ran && (
            <div className={`text-xs mt-1 ${tool.findingCount > 0 ? 'text-orange-600' : 'text-green-600'}`}>
              {tool.findingCount > 0 ? `${tool.findingCount} finding(s)` : 'Clean'}
            </div>
          )}
          {!tool.ran && <div className="text-xs mt-1 text-muted-foreground">Skipped</div>}
        </div>
      ))}
    </div>
  );
}

function FindingsList({ findings }: { findings: ScanFinding[] }) {
  if (findings.length === 0) {
    return <div className="rounded-lg border p-6 text-center text-muted-foreground text-sm">No findings reported.</div>;
  }

  const severityColor: Record<string, string> = {
    critical: 'text-red-600 bg-red-50 dark:bg-red-950',
    high: 'text-orange-600 bg-orange-50 dark:bg-orange-950',
    medium: 'text-yellow-600 bg-yellow-50 dark:bg-yellow-950',
    low: 'text-blue-600 bg-blue-50 dark:bg-blue-950'
  };

  return (
    <div className="rounded-lg border overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="text-left px-3 py-2 font-medium">Severity</th>
            <th className="text-left px-3 py-2 font-medium">Type</th>
            <th className="text-left px-3 py-2 font-medium">Description</th>
            <th className="text-left px-3 py-2 font-medium">Location</th>
            <th className="text-left px-3 py-2 font-medium">Tool</th>
          </tr>
        </thead>
        <tbody>
          {findings.map((f, i) => (
            <tr key={`${f.stage}-${f.type}-${i}`} className="border-b last:border-0">
              <td className="px-3 py-2">
                <span
                  className={`inline-flex px-1.5 py-0.5 rounded text-xs font-medium ${severityColor[f.severity] ?? ''}`}>
                  {f.severity}
                </span>
              </td>
              <td className="px-3 py-2 font-mono text-xs">{f.type}</td>
              <td className="px-3 py-2 max-w-xs truncate">{f.description}</td>
              <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{f.location ?? '\u2014'}</td>
              <td className="px-3 py-2 text-xs text-muted-foreground">{f.tool ?? f.stage}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ScanPipeline({
  stages
}: {
  stages: Array<{
    id: string;
    name: string;
    description: string;
    status: 'passed' | 'flagged' | 'skipped';
    findingCount: number;
    durationMs: number;
    tools: string[];
  }>;
}) {
  const statusIcon: Record<string, string> = {
    passed: '\u2713',
    flagged: '\u26A0',
    skipped: '\u2014'
  };
  const statusColor: Record<string, string> = {
    passed: 'text-green-600 border-green-200 bg-green-50 dark:bg-green-950 dark:border-green-800',
    flagged: 'text-orange-600 border-orange-200 bg-orange-50 dark:bg-orange-950 dark:border-orange-800',
    skipped: 'text-muted-foreground border-border bg-muted/50'
  };

  return (
    <div>
      <h3 className="text-sm font-semibold mb-3">Scan Pipeline</h3>
      <div className="space-y-2">
        {stages.map((stage) => (
          <div key={stage.id} className={`rounded-lg border p-3 ${statusColor[stage.status] ?? ''}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm">{statusIcon[stage.status]}</span>
                <span className="font-medium text-sm">{stage.name}</span>
              </div>
              {stage.findingCount > 0 && <span className="text-xs">{stage.findingCount} finding(s)</span>}
            </div>
            <div className="text-xs mt-1 opacity-80">{stage.description}</div>
            <div className="text-xs mt-1 opacity-60">Tools: {stage.tools.join(', ')}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ScoreBreakdown({
  criteria,
  totalScore,
  llmAnalysis
}: {
  criteria: Array<{
    label: string;
    passed: boolean;
    points: number;
    maxPoints: number;
  }>;
  totalScore: number;
  llmAnalysis?: LLMAnalysisInfo | null;
}) {
  return (
    <div>
      <h3 className="text-sm font-semibold mb-3">Score Breakdown</h3>
      <div className="rounded-lg border overflow-hidden">
        <div className="divide-y">
          {criteria.map((c) => (
            <div key={c.label} className="flex items-center justify-between px-3 py-2 text-sm">
              <div className="flex items-center gap-2">
                <span className={c.passed ? 'text-green-600' : 'text-red-600'}>{c.passed ? '\u2713' : '\u2717'}</span>
                <span>{c.label}</span>
              </div>
              <span className="text-xs text-muted-foreground">
                {c.points}/{c.maxPoints}
              </span>
            </div>
          ))}
        </div>
        <div className="border-t px-3 py-2 flex items-center justify-between bg-muted/50">
          <span className="font-medium text-sm">Total</span>
          <span className="font-bold">{totalScore}/10</span>
        </div>
        {llmAnalysis?.enabled && (
          <div className="border-t px-3 py-2 text-xs text-muted-foreground">
            LLM analysis: {llmAnalysis.mode === 'byollm' ? 'Custom' : 'Built-in'} model
          </div>
        )}
      </div>
    </div>
  );
}

// ── Screen component ──────────────────────────────────────────────────────────

interface SkillDetailScreenProps {
  data: SkillDetailResult;
}

export function SkillDetailScreen({ data }: SkillDetailScreenProps) {
  const latestManifest = safeParseJson(data.latestVersion?.manifest);
  const fileList: string[] = Array.isArray(latestManifest?.files) ? (latestManifest.files as string[]) : [];
  const license = typeof latestManifest?.license === 'string' ? latestManifest.license : null;
  const permissions = safeParsePermissions(data.latestVersion?.permissions);

  const permItems: string[] = [];
  if (permissions?.network?.outbound?.length) permItems.push(`Network: ${permissions.network.outbound.length} host(s)`);
  if (permissions?.filesystem?.read?.length || permissions?.filesystem?.write?.length)
    permItems.push('Filesystem access');
  if (permissions?.subprocess) permItems.push('Subprocess execution');

  const readmeContent = data.latestVersion?.readme;

  const scanDetails = data.latestVersion?.scanDetails;
  const hasSecurityData = data.latestVersion?.auditScore != null && scanDetails != null;

  const securityTab = hasSecurityData ? (
    <div className="space-y-6" data-testid="security-root">
      <SecurityOverview
        score={data.latestVersion?.auditScore ?? null}
        verdict={scanDetails?.verdict ?? null}
        durationMs={scanDetails?.durationMs ?? null}
        scannedAt={scanDetails?.scannedAt ? String(scanDetails.scannedAt) : null}
        criticalCount={scanDetails?.criticalCount ?? 0}
        highCount={scanDetails?.highCount ?? 0}
        mediumCount={scanDetails?.mediumCount ?? 0}
        lowCount={scanDetails?.lowCount ?? 0}
        llmAnalysis={scanDetails?.llm_analysis ?? null}
      />

      <div>
        <h3 className="text-sm font-semibold mb-2">Scanning Tools</h3>
        <ScanningToolsStrip
          tools={[
            {
              name: 'Semgrep',
              category: 'SAST',
              ran: scanDetails?.stagesRun?.includes('stage2') ?? false,
              findingCount:
                scanDetails?.findings?.filter((f) => f.stage === 'stage2' && f.tool?.includes('semgrep')).length ?? 0
            },
            {
              name: 'Bandit',
              category: 'Python AST',
              ran: scanDetails?.stagesRun?.includes('stage2') ?? false,
              findingCount: scanDetails?.findings?.filter((f) => f.tool === 'bandit').length ?? 0
            },
            {
              name: 'Cisco Skill Scanner',
              category: 'Agent Threats',
              ran: scanDetails?.stagesRun?.includes('stage3') ?? false,
              findingCount: scanDetails?.findings?.filter((f) => f.tool === 'cisco-skill-scanner').length ?? 0
            },
            {
              name: 'Snyk Agent Scan',
              category: 'AI Threats',
              ran: scanDetails?.stagesRun?.includes('stage3') ?? false,
              findingCount: scanDetails?.findings?.filter((f) => f.tool === 'snyk-agent-scan').length ?? 0
            },
            {
              name: 'detect-secrets',
              category: 'Secrets',
              ran: scanDetails?.stagesRun?.includes('stage4') ?? false,
              findingCount: scanDetails?.findings?.filter((f) => f.stage === 'stage4').length ?? 0
            },
            {
              name: 'OSV API',
              category: 'SCA',
              ran: scanDetails?.stagesRun?.includes('stage5') ?? false,
              findingCount: scanDetails?.findings?.filter((f) => f.stage === 'stage5').length ?? 0
            },
            {
              name: 'LLM Corroboration',
              category: scanDetails?.llm_analysis?.mode === 'byollm' ? 'Custom LLM' : 'Built-in',
              ran: scanDetails?.llm_analysis?.enabled ?? false,
              findingCount: scanDetails?.findings?.filter((f) => f.llm_reviewed).length ?? 0
            }
          ]}
        />
      </div>

      <div>
        <h3 className="text-sm font-semibold mb-3">
          Findings
          {scanDetails?.findings && scanDetails.findings.length > 0 && (
            <span className="ml-2 text-muted-foreground font-normal">({scanDetails.findings.length} total)</span>
          )}
        </h3>
        <FindingsList findings={scanDetails?.findings ?? []} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ScanPipeline
          stages={[
            {
              id: 'stage0',
              name: 'Ingestion',
              description: 'Download & extract tarball safely',
              status: scanDetails?.stagesRun?.includes('stage0') ? 'passed' : 'skipped',
              findingCount: scanDetails?.findings?.filter((f) => f.stage === 'stage0').length ?? 0,
              durationMs: 0,
              tools: ['httpx', 'tarfile', 'hashlib']
            },
            {
              id: 'stage1',
              name: 'Structure Validation',
              description: 'Check file types, sizes, paths',
              status: scanDetails?.stagesRun?.includes('stage1') ? 'passed' : 'skipped',
              findingCount: scanDetails?.findings?.filter((f) => f.stage === 'stage1').length ?? 0,
              durationMs: 0,
              tools: ['charset-normalizer', 'unicodedata']
            },
            {
              id: 'stage2',
              name: 'Static Analysis',
              description: 'Detect dangerous code patterns',
              status: scanDetails?.stagesRun?.includes('stage2')
                ? (scanDetails?.findings?.filter((f) => f.stage === 'stage2').length ?? 0) > 0
                  ? 'flagged'
                  : 'passed'
                : 'skipped',
              findingCount: scanDetails?.findings?.filter((f) => f.stage === 'stage2').length ?? 0,
              durationMs: 0,
              tools: ['Semgrep', 'Bandit', 'Custom AST']
            },
            {
              id: 'stage3',
              name: 'Injection Detection',
              description: 'Find prompt/shell injections',
              status: scanDetails?.stagesRun?.includes('stage3')
                ? (scanDetails?.findings?.filter((f) => f.stage === 'stage3').length ?? 0) > 0
                  ? 'flagged'
                  : 'passed'
                : 'skipped',
              findingCount: scanDetails?.findings?.filter((f) => f.stage === 'stage3').length ?? 0,
              durationMs: 0,
              tools: ['Regex patterns']
            },
            {
              id: 'stage4',
              name: 'Secrets Scanning',
              description: 'Detect leaked credentials',
              status: scanDetails?.stagesRun?.includes('stage4')
                ? (scanDetails?.findings?.filter((f) => f.stage === 'stage4').length ?? 0) > 0
                  ? 'flagged'
                  : 'passed'
                : 'skipped',
              findingCount: scanDetails?.findings?.filter((f) => f.stage === 'stage4').length ?? 0,
              durationMs: 0,
              tools: ['detect-secrets', 'Custom patterns']
            },
            {
              id: 'stage5',
              name: 'Dependency Audit',
              description: 'Check supply chain risks',
              status: scanDetails?.stagesRun?.includes('stage5')
                ? (scanDetails?.findings?.filter((f) => f.stage === 'stage5').length ?? 0) > 0
                  ? 'flagged'
                  : 'passed'
                : 'skipped',
              findingCount: scanDetails?.findings?.filter((f) => f.stage === 'stage5').length ?? 0,
              durationMs: 0,
              tools: ['OSV API', 'pip-audit']
            }
          ]}
        />

        <ScoreBreakdown
          criteria={[
            {
              label: 'SKILL.md present',
              passed: !!data.latestVersion?.readme,
              points: data.latestVersion?.readme ? 1 : 0,
              maxPoints: 1
            },
            {
              label: 'Description provided',
              passed: !!data.description,
              points: data.description ? 1 : 0,
              maxPoints: 1
            },
            {
              label: 'Permissions declared',
              passed: !!data.latestVersion?.permissions && Object.keys(data.latestVersion.permissions).length > 0,
              points: data.latestVersion?.permissions && Object.keys(data.latestVersion.permissions).length > 0 ? 1 : 0,
              maxPoints: 1
            },
            {
              label: 'No critical/high security issues',
              passed:
                (scanDetails?.findings?.filter((f) => f.severity === 'critical' || f.severity === 'high').length ??
                  0) === 0,
              points:
                (scanDetails?.findings?.filter((f) => f.severity === 'critical' || f.severity === 'high').length ??
                  0) === 0
                  ? 2
                  : 0,
              maxPoints: 2
            },
            { label: 'Permissions match detected usage', passed: true, points: 2, maxPoints: 2 },
            {
              label: 'File count under 100',
              passed: (data.latestVersion?.fileCount ?? 0) < 100,
              points: (data.latestVersion?.fileCount ?? 0) < 100 ? 1 : 0,
              maxPoints: 1
            },
            {
              label: 'README documentation',
              passed: !!data.latestVersion?.readme,
              points: data.latestVersion?.readme ? 1 : 0,
              maxPoints: 1
            },
            {
              label: 'Package under 5MB',
              passed: (data.latestVersion?.tarballSize ?? 0) < 5 * 1024 * 1024,
              points: (data.latestVersion?.tarballSize ?? 0) < 5 * 1024 * 1024 ? 1 : 0,
              maxPoints: 1
            }
          ]}
          totalScore={data.latestVersion?.auditScore ?? 0}
          llmAnalysis={scanDetails?.llm_analysis}
        />
      </div>
    </div>
  ) : null;

  // TanStack Start serializes Date to ISO string; coerce for JSON-LD
  const createdIso = typeof data.createdAt === 'string' ? data.createdAt : data.createdAt.toISOString();
  const updatedIso = typeof data.updatedAt === 'string' ? data.updatedAt : data.updatedAt.toISOString();

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'SoftwareSourceCode',
        name: data.name,
        description: data.description ?? undefined,
        url: `https://tankpkg.dev/skills/${encodeSkillName(data.name)}`,
        codeRepository: data.repositoryUrl ?? undefined,
        version: data.latestVersion?.version ?? undefined,
        datePublished: createdIso,
        dateModified: updatedIso,
        author: {
          '@type': 'Person',
          name: data.publisher.name,
          ...(data.publisher.githubUsername ? { url: `https://github.com/${data.publisher.githubUsername}` } : {})
        },
        programmingLanguage: 'Markdown',
        runtimePlatform: 'Tank CLI',
        applicationCategory: 'DeveloperTool',
        ...(data.downloadCount > 0
          ? {
              interactionStatistic: {
                '@type': 'InteractionCounter',
                interactionType: 'https://schema.org/DownloadAction',
                userInteractionCount: data.downloadCount
              }
            }
          : {})
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Tank', item: 'https://tankpkg.dev' },
          { '@type': 'ListItem', position: 2, name: 'Skills', item: 'https://tankpkg.dev/skills' },
          {
            '@type': 'ListItem',
            position: 3,
            name: data.name,
            item: `https://tankpkg.dev/skills/${encodeSkillName(data.name)}`
          }
        ]
      }
    ]
  };

  return (
    <>
      <script
        type="application/ld+json"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD structured data from server-side values only
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="max-w-6xl mx-auto" data-testid="skill-detail-root">
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold tracking-tight font-mono">{data.name}</h1>
            {data.latestVersion && (
              <Badge variant="secondary" className="font-mono text-xs">
                {data.latestVersion.version}
              </Badge>
            )}
            {data.visibility === 'private' && (
              <Badge variant="outline" className="text-xs">
                Private
              </Badge>
            )}
          </div>
          {data.description && <p className="text-muted-foreground">{data.description}</p>}
        </div>

        <div className="flex gap-8 items-start">
          <div className="flex-1 min-w-0">
            <SkillTabs
              readmeContent={readmeContent ?? null}
              versions={data.versions.map((v) => ({
                ...v,
                publishedAt: v.publishedAt instanceof Date ? v.publishedAt.toISOString() : String(v.publishedAt)
              }))}
              files={fileList}
              skillName={data.name}
              version={data.latestVersion?.version ?? ''}
              readme={data.latestVersion?.readme ?? null}
              manifest={latestManifest}
              securityTab={securityTab}
              hasSecurityData={hasSecurityData}
            />
          </div>

          <aside className="w-72 shrink-0 space-y-4 sticky top-4">
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Install</h3>
              <InstallCommand name={data.name} />
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
                    className="text-sm text-primary hover:underline inline-flex items-center gap-1">
                    {data.repositoryUrl.replace('https://github.com/', '')}
                    <span className="text-xs">&#8599;</span>
                  </a>
                </div>
                <Separator />
              </>
            )}

            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Metadata</h3>
              <dl className="space-y-2 text-sm">
                {data.latestVersion && (
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Version</dt>
                    <dd className="font-mono text-xs">{data.latestVersion.version}</dd>
                  </div>
                )}
                {license && (
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">License</dt>
                    <dd>{license}</dd>
                  </div>
                )}
                <div className="flex justify-between items-center">
                  <dt className="text-muted-foreground flex items-center gap-1">
                    <Star className="h-3 w-3" />
                    Stars
                  </dt>
                  <dd className="text-sm">{data.starCount}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Weekly</dt>
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
                  <dd>{data.latestVersion ? timeAgo(data.latestVersion.publishedAt) : '\u2014'}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Publisher</dt>
                  <dd>
                    {data.publisher.githubUsername ? (
                      <a
                        href={`https://github.com/${data.publisher.githubUsername}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:underline">
                        {data.publisher.githubUsername}
                      </a>
                    ) : (
                      data.publisher.name
                    )}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Visibility</dt>
                  <dd>{data.visibility}</dd>
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
                  <div className="flex items-center gap-2 mb-2">
                    <span
                      className={`text-2xl font-bold ${
                        data.latestVersion.auditScore >= 8
                          ? 'text-green-600'
                          : data.latestVersion.auditScore >= 6
                            ? 'text-yellow-600'
                            : data.latestVersion.auditScore >= 4
                              ? 'text-orange-600'
                              : 'text-red-600'
                      }`}>
                      {data.latestVersion.auditScore}
                    </span>
                    <span className="text-sm text-muted-foreground">/10</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden mb-3">
                    <div
                      className={`h-full transition-all ${
                        data.latestVersion.auditScore >= 8
                          ? 'bg-green-500'
                          : data.latestVersion.auditScore >= 6
                            ? 'bg-yellow-500'
                            : data.latestVersion.auditScore >= 4
                              ? 'bg-orange-500'
                              : 'bg-red-500'
                      }`}
                      style={{ width: `${(data.latestVersion.auditScore / 10) * 100}%` }}
                    />
                  </div>

                  {scanDetails?.verdict && (
                    <div
                      className={`inline-flex px-2 py-1 rounded text-xs font-medium text-white mb-2 ${
                        scanDetails.verdict === 'pass'
                          ? 'bg-green-600'
                          : scanDetails.verdict === 'pass_with_notes'
                            ? 'bg-yellow-600'
                            : scanDetails.verdict === 'flagged'
                              ? 'bg-orange-600'
                              : 'bg-red-600'
                      }`}>
                      {scanDetails.verdict.replace('_', ' ').toUpperCase()}
                    </div>
                  )}

                  <div className="text-xs space-y-1 mb-3">
                    {(scanDetails?.criticalCount ?? 0) > 0 && (
                      <div className="flex items-center gap-2 text-red-600">
                        <span>&#9679;</span>
                        <span>
                          {scanDetails?.criticalCount} critical finding
                          {(scanDetails?.criticalCount ?? 0) !== 1 ? 's' : ''}
                        </span>
                      </div>
                    )}
                    {(scanDetails?.highCount ?? 0) > 0 && (
                      <div className="flex items-center gap-2 text-orange-600">
                        <span>&#9679;</span>
                        <span>
                          {scanDetails?.highCount} high finding
                          {(scanDetails?.highCount ?? 0) !== 1 ? 's' : ''}
                        </span>
                      </div>
                    )}
                    {(scanDetails?.mediumCount ?? 0) > 0 && (
                      <div className="flex items-center gap-2 text-yellow-600">
                        <span>&#9679;</span>
                        <span>
                          {scanDetails?.mediumCount} medium finding
                          {(scanDetails?.mediumCount ?? 0) !== 1 ? 's' : ''}
                        </span>
                      </div>
                    )}
                    {(scanDetails?.lowCount ?? 0) > 0 && (
                      <div className="flex items-center gap-2 text-blue-600">
                        <span>&#9679;</span>
                        <span>
                          {scanDetails?.lowCount} low finding
                          {(scanDetails?.lowCount ?? 0) !== 1 ? 's' : ''}
                        </span>
                      </div>
                    )}
                    {(scanDetails?.findings?.length ?? 0) === 0 && (
                      <div className="flex items-center gap-2 text-green-600">
                        <span>&#10003;</span>
                        <span>No security issues</span>
                      </div>
                    )}
                  </div>

                  {hasSecurityData && (
                    <p className="text-xs text-muted-foreground">Open the Security tab above for the full report.</p>
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
                      <li key={item} className="text-sm flex items-center gap-1.5">
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
    </>
  );
}
