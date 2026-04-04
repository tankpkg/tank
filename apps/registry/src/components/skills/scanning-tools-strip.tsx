import { Bot, Bug, Key, Link2, ScanSearch, Shield } from 'lucide-react';

import type { ScanFinding } from '~/lib/skills/data';

export interface ScanningTool {
  name: string;
  category: string;
  icon: React.ReactNode;
  ran: boolean;
  findingCount: number;
  status: 'ran' | 'skipped' | 'failed';
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
      {tool.status === 'skipped' && <div className="text-xs mt-1 text-muted-foreground">Skipped</div>}
    </div>
  );
}

export function ScanningToolsStrip({ tools }: ScanningToolsStripProps) {
  if (tools.length === 0) return null;

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
      {tools.map((tool) => (
        <ToolCard key={tool.name} tool={tool} />
      ))}
    </div>
  );
}

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

  return [
    {
      name: 'Semgrep',
      category: 'SAST',
      icon: <ScanSearch className="size-4" />,
      ran: stagesRun.includes('stage2'),
      status: stagesRun.includes('stage2') ? 'ran' : 'skipped',
      findingCount: findings.filter((f) => f.tool?.includes('semgrep')).length
    },
    {
      name: 'Bandit',
      category: 'Python AST',
      icon: <Bug className="size-4" />,
      ran: stagesRun.includes('stage2'),
      status: stagesRun.includes('stage2') ? 'ran' : 'skipped',
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
      findingCount: findings.filter((f) => f.tool === 'stage5_osv').length
    },
    {
      name: 'LLM Corroboration',
      category: scanDetails.llm_analysis?.mode === 'byollm' ? 'Custom LLM' : 'Built-in',
      icon: <Bot className="size-4" />,
      ran: scanDetails.llm_analysis?.enabled ?? false,
      status: scanDetails.llm_analysis?.enabled ? 'ran' : 'skipped',
      findingCount: findings.filter((f) => f.llm_reviewed).length
    }
  ];
}
