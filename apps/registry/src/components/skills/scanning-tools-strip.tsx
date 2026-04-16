import { Bot, Bug, Download, Key, Link2, ScanSearch, Shield, Zap } from 'lucide-react';

import type { ScanFinding } from '~/lib/skills/data';

export interface ScanningTool {
  name: string;
  category: string;
  icon: React.ReactNode;
  ran: boolean;
  findingCount: number;
  status: 'ran' | 'skipped' | 'failed';
  /** Why this tool was skipped — shown below the "Skipped" label */
  skipReason?: string;
}

export interface ScanningToolsStripProps {
  tools: ScanningTool[];
}

function ToolCard({ tool }: { tool: ScanningTool }) {
  return (
    <div className={`rounded-lg border p-3 text-sm min-w-0 ${tool.ran ? 'bg-card' : 'bg-muted/50 opacity-60'}`}>
      <div className="flex items-center gap-2">
        <span className="shrink-0 text-muted-foreground">{tool.icon}</span>
        <span className="font-medium truncate">{tool.name}</span>
      </div>
      <div className="text-xs text-muted-foreground mt-0.5">{tool.category}</div>
      {tool.status === 'ran' && (
        <div
          className={`text-xs mt-1 ${tool.findingCount > 0 ? 'text-orange-600 dark:text-orange-400' : 'text-green-600 dark:text-green-400'}`}>
          {tool.findingCount > 0 ? `${tool.findingCount} finding${tool.findingCount !== 1 ? 's' : ''}` : 'Clean'}
        </div>
      )}
      {tool.status === 'failed' && <div className="text-xs mt-1 text-red-600 dark:text-red-400">Failed</div>}
      {tool.status === 'skipped' && (
        <div className="text-xs mt-1 text-muted-foreground">{tool.skipReason ?? 'Skipped'}</div>
      )}
    </div>
  );
}

export function ScanningToolsStrip({ tools }: ScanningToolsStripProps) {
  if (tools.length === 0) return null;

  const ranCount = tools.filter((t) => t.status === 'ran').length;
  const total = tools.length;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full bg-emerald-500 transition-all"
            style={{ width: `${Math.round((ranCount / total) * 100)}%` }}
          />
        </div>
        <span className="text-xs text-muted-foreground shrink-0">
          {ranCount}/{total} tools ran
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {tools.map((tool) => (
          <ToolCard key={tool.name} tool={tool} />
        ))}
      </div>
    </div>
  );
}

/** Skip reasons for tools that can't run in certain scan contexts. */
const SKIP_REASONS: Record<string, string> = {
  stage1: 'Requires package structure',
  stage2: 'No source code to analyze',
  stage5: 'No dependency manifest',
  llm: 'Not configured'
};

/**
 * Build the scanning tools list dynamically from actual findings data.
 * Uses finding counts and stage presence to determine tool status.
 */
export function buildScanningTools(scanDetails: {
  stagesRun?: string[];
  findings?: ScanFinding[];
  llm_analysis?: { enabled?: boolean; mode?: string } | null;
}): ScanningTool[] {
  const stagesRun = scanDetails.stagesRun ?? [];
  const findings = scanDetails.findings ?? [];

  const ingestFailed = stagesRun.includes('stage0') && findings.some((f) => f.stage === 'stage0');

  return [
    {
      name: 'Download & Ingest',
      category: 'Package Fetch',
      icon: <Download className="size-4" />,
      ran: true,
      status: ingestFailed ? 'failed' : 'ran',
      findingCount: findings.filter((f) => f.stage === 'stage0').length
    },
    {
      name: 'Structure Validator',
      category: 'Validation',
      icon: <Shield className="size-4" />,
      ran: stagesRun.includes('stage1'),
      status: stagesRun.includes('stage1') ? 'ran' : 'skipped',
      skipReason: stagesRun.includes('stage1') ? undefined : SKIP_REASONS.stage1,
      findingCount: findings.filter((f) => f.stage === 'stage1').length
    },
    {
      name: 'Semgrep',
      category: 'SAST',
      icon: <ScanSearch className="size-4" />,
      ran: stagesRun.includes('stage2'),
      status: stagesRun.includes('stage2') ? 'ran' : 'skipped',
      skipReason: stagesRun.includes('stage2') ? undefined : SKIP_REASONS.stage2,
      findingCount: findings.filter((f) => f.tool?.includes('semgrep')).length
    },
    {
      name: 'Bandit',
      category: 'Python AST',
      icon: <Bug className="size-4" />,
      ran: stagesRun.includes('stage2'),
      status: stagesRun.includes('stage2') ? 'ran' : 'skipped',
      skipReason: stagesRun.includes('stage2') ? undefined : SKIP_REASONS.stage2,
      findingCount: findings.filter((f) => f.tool === 'bandit').length
    },
    {
      name: 'Regex Patterns',
      category: 'Injection Detection',
      icon: <Shield className="size-4" />,
      ran: stagesRun.includes('stage3'),
      status: stagesRun.includes('stage3') ? 'ran' : 'skipped',
      findingCount: findings.filter((f) => f.tool === 'stage3_regex' || f.tool === 'stage3_heuristic').length
    },
    {
      name: 'Cisco Skill Scanner',
      category: 'Agent Threats',
      icon: <Shield className="size-4" />,
      ran: stagesRun.includes('stage3'),
      status: stagesRun.includes('stage3') ? 'ran' : 'skipped',
      findingCount: findings.filter((f) => f.tool?.startsWith('skill-scanner')).length
    },
    {
      name: 'Snyk Agent Scan',
      category: 'AI Threats',
      icon: <Shield className="size-4" />,
      ran: stagesRun.includes('stage3'),
      status: stagesRun.includes('stage3') ? 'ran' : 'skipped',
      findingCount: findings.filter((f) => f.tool === 'snyk-agent-scan').length
    },
    {
      name: 'detect-secrets',
      category: 'Secrets',
      icon: <Key className="size-4" />,
      ran: stagesRun.includes('stage4'),
      status: stagesRun.includes('stage4') ? 'ran' : 'skipped',
      findingCount: findings.filter((f) => f.tool === 'detect-secrets').length
    },
    {
      name: 'Custom Patterns',
      category: 'Secrets',
      icon: <Key className="size-4" />,
      ran: stagesRun.includes('stage4'),
      status: stagesRun.includes('stage4') ? 'ran' : 'skipped',
      findingCount: findings.filter((f) => f.tool === 'stage4_custom').length
    },
    {
      name: 'OSV.dev',
      category: 'Supply Chain',
      icon: <Link2 className="size-4" />,
      ran: stagesRun.includes('stage5'),
      status: stagesRun.includes('stage5') ? 'ran' : 'skipped',
      skipReason: stagesRun.includes('stage5') ? undefined : SKIP_REASONS.stage5,
      findingCount: findings.filter((f) => f.tool === 'stage5_osv').length
    },
    {
      name: 'Token Analyzer',
      category: 'Token Efficiency',
      icon: <Zap className="size-4" />,
      ran: stagesRun.includes('stageT'),
      status: stagesRun.includes('stageT') ? 'ran' : 'skipped',
      skipReason: stagesRun.includes('stageT') ? undefined : 'tokenomics not available',
      findingCount: findings.filter((f) => f.tool === 'token_analyzer' && f.type !== 'token_summary').length
    },
    {
      name: 'LLM Corroboration',
      category: scanDetails.llm_analysis?.mode === 'byollm' ? 'Custom LLM' : 'Built-in',
      icon: <Bot className="size-4" />,
      ran: scanDetails.llm_analysis?.enabled ?? false,
      status: scanDetails.llm_analysis?.enabled ? 'ran' : 'skipped',
      skipReason: scanDetails.llm_analysis?.enabled ? undefined : SKIP_REASONS.llm,
      findingCount: findings.filter((f) => f.llm_reviewed).length
    }
  ];
}
