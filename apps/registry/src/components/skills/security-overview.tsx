import { ShieldAlert, ShieldCheck, ShieldX } from 'lucide-react';

import { formatDate } from '~/lib/format';
import type { LLMAnalysisInfo } from '~/lib/skills/data';

export interface SecurityOverviewProps {
  verdict: string | null;
  durationMs: number | null;
  scannedAt: string | null;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  llmAnalysis: LLMAnalysisInfo | null;
}

function VerdictIcon({ verdict }: { verdict: string | null }) {
  switch (verdict) {
    case 'pass':
      return <ShieldCheck className="size-8 text-green-500" />;
    case 'pass_with_notes':
      return <ShieldCheck className="size-8 text-yellow-500" />;
    case 'flagged':
      return <ShieldAlert className="size-8 text-orange-500" />;
    case 'fail':
      return <ShieldX className="size-8 text-red-500" />;
    default:
      return <ShieldCheck className="size-8 text-muted-foreground" />;
  }
}

const VERDICT_LABELS: Record<string, string> = {
  pass: 'Verified Safe',
  pass_with_notes: 'Passed with Notes',
  flagged: 'Flagged',
  fail: 'Unsafe'
};

function buildSummary(
  verdict: string | null,
  counts: { critical: number; high: number; medium: number; low: number }
): string {
  if (!verdict || verdict === 'pass') return 'No security issues found';
  const parts: string[] = [];
  if (counts.critical > 0) parts.push(`${counts.critical} critical ${counts.critical === 1 ? 'issue' : 'issues'}`);
  if (counts.high > 0) parts.push(`${counts.high} high-severity ${counts.high === 1 ? 'risk' : 'risks'}`);
  if (counts.medium > 0) parts.push(`${counts.medium} medium-severity ${counts.medium === 1 ? 'finding' : 'findings'}`);
  if (parts.length === 0 && counts.low > 0) return `${counts.low} low-severity ${counts.low === 1 ? 'note' : 'notes'}`;
  return parts.length > 0 ? parts.join(', ') : 'No security issues found';
}

export function SecurityOverview({
  verdict,
  durationMs,
  scannedAt,
  criticalCount,
  highCount,
  mediumCount,
  lowCount,
  llmAnalysis
}: SecurityOverviewProps) {
  const totalFindings = criticalCount + highCount + mediumCount + lowCount;
  const summary = buildSummary(verdict, {
    critical: criticalCount,
    high: highCount,
    medium: mediumCount,
    low: lowCount
  });

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3" data-testid="security-overview">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <VerdictIcon verdict={verdict} />
          <div>
            <div className="font-display text-lg font-semibold tracking-tight">
              {VERDICT_LABELS[verdict ?? 'pass'] ?? 'Unknown'}
            </div>
            <p className="text-sm text-muted-foreground">{summary}</p>
          </div>
        </div>
        <div className="text-xs text-muted-foreground text-right space-y-0.5 shrink-0">
          {durationMs != null && <div>Scan duration: {(durationMs / 1000).toFixed(1)}s</div>}
          {scannedAt && <div>Scanned: {formatDate(scannedAt)}</div>}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {criticalCount > 0 && (
          <span className="inline-flex items-center rounded-md bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-950 dark:text-red-400">
            {criticalCount} critical
          </span>
        )}
        {highCount > 0 && (
          <span className="inline-flex items-center rounded-md bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700 dark:bg-orange-950 dark:text-orange-400">
            {highCount} high
          </span>
        )}
        {mediumCount > 0 && (
          <span className="inline-flex items-center rounded-md bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-700 dark:bg-yellow-950 dark:text-yellow-400">
            {mediumCount} medium
          </span>
        )}
        {lowCount > 0 && (
          <span className="inline-flex items-center rounded-md bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-950 dark:text-blue-400">
            {lowCount} low
          </span>
        )}
        {totalFindings === 0 && (
          <span className="inline-flex items-center rounded-md bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-950 dark:text-green-400">
            No issues
          </span>
        )}
      </div>

      {llmAnalysis?.enabled && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
            LLM Reviewed
          </span>
          <span>{llmAnalysis.mode === 'byollm' ? 'Custom LLM' : 'Built-in'}</span>
          {llmAnalysis.providers?.map((p) => (
            <span key={p.name}>
              {p.name}/{p.model} ({p.status})
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
