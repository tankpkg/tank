import { encodeSkillName } from '@internals/helpers';
import { DepAuditCard } from '~/components/skills/dep-audit-card';
import { FindingsTable } from '~/components/skills/findings-table';
import type { PipelineStage } from '~/components/skills/scan-pipeline';
import { ScanPipeline } from '~/components/skills/scan-pipeline';
import { buildScanningTools, type ScanningTool, ScanningToolsStrip } from '~/components/skills/scanning-tools-strip';
import { SecurityOverview } from '~/components/skills/security-overview';
import { Card, CardContent } from '~/components/ui/card';
import type { ScanDetails, ScanFinding, SkillDetailResult } from '~/lib/skills/data';

function getScanningTools(scanDetails: ScanDetails): ScanningTool[] {
  return buildScanningTools({
    stagesRun: scanDetails.stagesRun ?? [],
    findings: scanDetails.findings ?? [],
    llm_analysis: scanDetails.llm_analysis
  });
}

function buildPipelineStages(scanDetails: ScanDetails): PipelineStage[] {
  const stageStatus = (stageId: string): 'passed' | 'flagged' | 'skipped' => {
    if (!scanDetails.stagesRun?.includes(stageId)) return 'skipped';
    return (scanDetails.findings?.filter((f) => f.stage === stageId).length ?? 0) > 0 ? 'flagged' : 'passed';
  };

  const stageFindingCount = (stageId: string) => scanDetails.findings?.filter((f) => f.stage === stageId).length ?? 0;

  return [
    {
      id: 'stage0',
      name: 'Ingestion',
      description: 'Download & extract tarball safely',
      status: scanDetails.stagesRun?.includes('stage0') ? 'passed' : 'skipped',
      findingCount: stageFindingCount('stage0'),
      durationMs: 0,
      tools: ['httpx', 'tarfile', 'hashlib']
    },
    {
      id: 'stage1',
      name: 'Structure Validation',
      description: 'Check file types, sizes, paths',
      status: scanDetails.stagesRun?.includes('stage1') ? 'passed' : 'skipped',
      findingCount: stageFindingCount('stage1'),
      durationMs: 0,
      tools: ['charset-normalizer', 'unicodedata']
    },
    {
      id: 'stage2',
      name: 'Static Analysis',
      description: 'Detect dangerous code patterns',
      status: stageStatus('stage2'),
      findingCount: stageFindingCount('stage2'),
      durationMs: 0,
      tools: ['Semgrep', 'Bandit', 'Custom AST']
    },
    {
      id: 'stage3',
      name: 'Injection Detection',
      description: 'Find prompt/shell injections',
      status: stageStatus('stage3'),
      findingCount: stageFindingCount('stage3'),
      durationMs: 0,
      tools: ['Regex patterns', 'Cisco Scanner', 'Snyk Agent']
    },
    {
      id: 'stage4',
      name: 'Secrets Scanning',
      description: 'Detect leaked credentials',
      status: stageStatus('stage4'),
      findingCount: stageFindingCount('stage4'),
      durationMs: 0,
      tools: ['detect-secrets', 'Custom patterns']
    },
    {
      id: 'stage5',
      name: 'Dependency Audit',
      description: 'Check supply chain risks',
      status: stageStatus('stage5'),
      findingCount: stageFindingCount('stage5'),
      durationMs: 0,
      tools: ['OSV API', 'pip-audit']
    }
  ];
}

function TokenEfficiencyCard({ findings }: { findings: ScanFinding[] }) {
  const summary = findings.find((f) => f.stage === 'stageT' && f.type === 'token_summary');
  if (!summary?.evidence) return null;

  let evidence: {
    grade?: string;
    efficiency_score?: number;
    estimated_tokens_per_invocation?: number;
    cost_per_use?: {
      sonnet?: string;
      opus?: string;
      sonnet_context_load?: string;
      opus_context_load?: string;
    };
    one_liner?: string;
    comparison?: string;
    what_this_means?: string;
  };
  try {
    evidence = JSON.parse(summary.evidence);
  } catch {
    return null;
  }

  const grade = evidence.grade;
  const score = evidence.efficiency_score;
  const tokens = evidence.estimated_tokens_per_invocation;
  const costSonnet = evidence.cost_per_use?.sonnet_context_load ?? evidence.cost_per_use?.sonnet;
  const costOpus = evidence.cost_per_use?.opus_context_load ?? evidence.cost_per_use?.opus;

  // Individual token findings (excluding the summary)
  const tokenFindings = findings.filter((f) => f.stage === 'stageT' && f.type !== 'token_summary');

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        {evidence.one_liner && <p className="text-sm text-muted-foreground">{evidence.one_liner}</p>}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {tokens != null && (
            <div>
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Tokens per Invocation
              </span>
              <p className="mt-1 text-2xl font-semibold tabular-nums">~{tokens.toLocaleString()}</p>
              {evidence.comparison && <p className="mt-0.5 text-xs text-muted-foreground">{evidence.comparison}</p>}
            </div>
          )}
          {(costSonnet || costOpus) && (
            <div>
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Context Load Cost
              </span>
              <div className="mt-1 flex flex-col gap-0.5">
                {costSonnet && (
                  <span className="text-sm font-medium tabular-nums">
                    {costSonnet} <span className="text-muted-foreground">Sonnet context</span>
                  </span>
                )}
                {costOpus && (
                  <span className="text-sm font-medium tabular-nums">
                    {costOpus} <span className="text-muted-foreground">Opus context</span>
                  </span>
                )}
              </div>
            </div>
          )}
          {grade && (
            <div>
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Grade</span>
              <p className="mt-1 text-2xl font-semibold">{grade}</p>
            </div>
          )}
          {score != null && (
            <div>
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Efficiency Score
              </span>
              <p className="mt-1 text-2xl font-semibold tabular-nums">
                {score}
                <span className="text-sm font-normal text-muted-foreground">/100</span>
              </p>
            </div>
          )}
        </div>

        {evidence.what_this_means && <p className="text-sm text-muted-foreground">{evidence.what_this_means}</p>}

        {tokenFindings.length > 0 && (
          <div className="space-y-2">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Recommendations</span>
            <ul className="space-y-1.5">
              {tokenFindings.map((f, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: findings can have duplicate stage+type
                <li key={`token-${f.type}-${i}`} className="flex items-start gap-2 text-sm">
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-teal-500" />
                  <div>
                    <span className="font-medium">{f.description}</span>
                    {f.remediation && <p className="mt-0.5 text-muted-foreground">{f.remediation}</p>}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function buildTokenTab({ scanDetails }: { data: SkillDetailResult; scanDetails: ScanDetails }) {
  const allFindings = scanDetails.findings ?? [];
  const hasTokenFindings = allFindings.some((f) => f.stage === 'stageT');

  if (!hasTokenFindings) return null;

  return (
    <div className="space-y-6" data-testid="token-root">
      <div>
        <h2 className="font-display text-xl font-semibold tracking-tight">Token Efficiency</h2>
        <p className="mt-1 text-sm text-muted-foreground">Estimated token usage and cost per invocation.</p>
        <div className="mt-3">
          <TokenEfficiencyCard findings={allFindings} />
        </div>
      </div>
    </div>
  );
}

export function buildSecurityTab({ data: _data, scanDetails }: { data: SkillDetailResult; scanDetails: ScanDetails }) {
  const allFindings = (scanDetails.findings ?? []).filter((f) => f.stage !== 'stageT');

  return (
    <div className="space-y-6" data-testid="security-root">
      <SecurityOverview
        verdict={scanDetails.verdict ?? null}
        durationMs={scanDetails.durationMs ?? null}
        scannedAt={scanDetails.scannedAt ? String(scanDetails.scannedAt) : null}
        criticalCount={scanDetails.criticalCount ?? 0}
        highCount={scanDetails.highCount ?? 0}
        mediumCount={scanDetails.mediumCount ?? 0}
        lowCount={scanDetails.lowCount ?? 0}
        llmAnalysis={scanDetails.llm_analysis ?? null}
      />

      <div>
        <h2 className="font-display text-xl font-semibold tracking-tight">Scanning Tools</h2>
        <p className="mt-1 text-sm text-muted-foreground">Tools that analyzed this skill.</p>
        <div className="mt-3">
          <ScanningToolsStrip tools={getScanningTools(scanDetails)} />
        </div>
      </div>

      {allFindings.length > 0 && (
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-display text-xl font-semibold tracking-tight">Findings</h2>
            <span className="text-sm text-muted-foreground">({allFindings.length})</span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">Issues detected during the scan.</p>
          <div className="mt-3">
            <FindingsTable findings={allFindings} />
          </div>
        </div>
      )}

      <ScanPipeline stages={buildPipelineStages(scanDetails)} />

      {scanDetails.depAudit && <DepAuditCard depAudit={scanDetails.depAudit} />}
    </div>
  );
}

export function buildSkillJsonLd(data: SkillDetailResult) {
  const createdIso = typeof data.createdAt === 'string' ? data.createdAt : data.createdAt.toISOString();
  const updatedIso = typeof data.updatedAt === 'string' ? data.updatedAt : data.updatedAt.toISOString();

  return {
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
}
