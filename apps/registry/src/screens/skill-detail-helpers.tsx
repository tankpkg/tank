import { encodeSkillName } from '@internals/helpers';
import { DepAuditCard } from '~/components/skills/dep-audit-card';
import { FindingsTable } from '~/components/skills/findings-table';
import type { PipelineStage } from '~/components/skills/scan-pipeline';
import { ScanPipeline } from '~/components/skills/scan-pipeline';
import { buildScanningTools, type ScanningTool, ScanningToolsStrip } from '~/components/skills/scanning-tools-strip';
import { SecurityOverview } from '~/components/skills/security-overview';
import type { ScanDetails, SkillDetailResult } from '~/lib/skills/data';

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

export function buildSecurityTab({ data, scanDetails }: { data: SkillDetailResult; scanDetails: ScanDetails }) {
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

      <div>
        <div className="flex items-center gap-2">
          <h2 className="font-display text-xl font-semibold tracking-tight">Findings</h2>
          {scanDetails.findings && scanDetails.findings.length > 0 && (
            <span className="text-sm text-muted-foreground">({scanDetails.findings.length} total)</span>
          )}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">Security issues detected during the scan.</p>
        <div className="mt-3">
          <FindingsTable findings={scanDetails.findings ?? []} />
        </div>
      </div>

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
