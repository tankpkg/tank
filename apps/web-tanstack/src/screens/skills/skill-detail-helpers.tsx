import { encodeSkillName } from '@internals/helpers';
import { FindingsTable } from '~/components/skills/findings-table';
import { ScanPipeline } from '~/components/skills/scan-pipeline';
import type { PipelineStage } from '~/components/skills/scan-pipeline';
import { ScanningToolsStrip } from '~/components/skills/scanning-tools-strip';
import type { ScanningTool } from '~/components/skills/scanning-tools-strip';
import { ScoreBreakdown } from '~/components/skills/score-breakdown';
import type { ScoreCriterion } from '~/components/skills/score-breakdown';
import { SecurityOverview } from '~/components/skills/security-overview';
import type { ScanDetails, SkillDetailResult } from '~/lib/data/skills';

function buildScanningTools(scanDetails: ScanDetails): ScanningTool[] {
  return [
    {
      name: 'Semgrep',
      category: 'SAST',
      ran: scanDetails.stagesRun?.includes('stage2') ?? false,
      findingCount:
        scanDetails.findings?.filter((f) => f.stage === 'stage2' && f.tool?.includes('semgrep')).length ?? 0
    },
    {
      name: 'Bandit',
      category: 'Python AST',
      ran: scanDetails.stagesRun?.includes('stage2') ?? false,
      findingCount: scanDetails.findings?.filter((f) => f.tool === 'bandit').length ?? 0
    },
    {
      name: 'Cisco Skill Scanner',
      category: 'Agent Threats',
      ran: scanDetails.stagesRun?.includes('stage3') ?? false,
      findingCount: scanDetails.findings?.filter((f) => f.tool === 'cisco-skill-scanner').length ?? 0
    },
    {
      name: 'Snyk Agent Scan',
      category: 'AI Threats',
      ran: scanDetails.stagesRun?.includes('stage3') ?? false,
      findingCount: scanDetails.findings?.filter((f) => f.tool === 'snyk-agent-scan').length ?? 0
    },
    {
      name: 'detect-secrets',
      category: 'Secrets',
      ran: scanDetails.stagesRun?.includes('stage4') ?? false,
      findingCount: scanDetails.findings?.filter((f) => f.stage === 'stage4').length ?? 0
    },
    {
      name: 'OSV API',
      category: 'SCA',
      ran: scanDetails.stagesRun?.includes('stage5') ?? false,
      findingCount: scanDetails.findings?.filter((f) => f.stage === 'stage5').length ?? 0
    },
    {
      name: 'LLM Corroboration',
      category: scanDetails.llm_analysis?.mode === 'byollm' ? 'Custom LLM' : 'Built-in',
      ran: scanDetails.llm_analysis?.enabled ?? false,
      findingCount: scanDetails.findings?.filter((f) => f.llm_reviewed).length ?? 0
    }
  ];
}

function buildPipelineStages(scanDetails: ScanDetails): PipelineStage[] {
  const stageStatus = (stageId: string): 'passed' | 'flagged' | 'skipped' => {
    if (!scanDetails.stagesRun?.includes(stageId)) return 'skipped';
    return (scanDetails.findings?.filter((f) => f.stage === stageId).length ?? 0) > 0 ? 'flagged' : 'passed';
  };

  const stageFindingCount = (stageId: string) =>
    scanDetails.findings?.filter((f) => f.stage === stageId).length ?? 0;

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
      tools: ['Regex patterns']
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

function buildScoreCriteria(data: SkillDetailResult, scanDetails: ScanDetails): ScoreCriterion[] {
  return [
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
        (scanDetails.findings?.filter((f) => f.severity === 'critical' || f.severity === 'high').length ?? 0) === 0,
      points:
        (scanDetails.findings?.filter((f) => f.severity === 'critical' || f.severity === 'high').length ?? 0) === 0
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
  ];
}

export function buildSecurityTab({
  data,
  scanDetails
}: {
  data: SkillDetailResult;
  scanDetails: ScanDetails;
}) {
  return (
    <div className="space-y-6" data-testid="security-root">
      <SecurityOverview
        score={data.latestVersion?.auditScore ?? null}
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
        <h3 className="text-sm font-semibold mb-2">Scanning Tools</h3>
        <ScanningToolsStrip tools={buildScanningTools(scanDetails)} />
      </div>

      <div>
        <h3 className="text-sm font-semibold mb-3">
          Findings
          {scanDetails.findings && scanDetails.findings.length > 0 && (
            <span className="ml-2 text-muted-foreground font-normal">({scanDetails.findings.length} total)</span>
          )}
        </h3>
        <FindingsTable findings={scanDetails.findings ?? []} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ScanPipeline stages={buildPipelineStages(scanDetails)} />
        <ScoreBreakdown
          criteria={buildScoreCriteria(data, scanDetails)}
          totalScore={data.latestVersion?.auditScore ?? 0}
          llmAnalysis={scanDetails.llm_analysis}
        />
      </div>
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
