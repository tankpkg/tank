import type { LLMAnalysisInfo } from '~/lib/skills/data';
import { formatDate } from '~/lib/format';

export interface SecurityOverviewProps {
  score: number | null;
  verdict: string | null;
  durationMs: number | null;
  scannedAt: string | null;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  llmAnalysis: LLMAnalysisInfo | null;
}

export function SecurityOverview({
  score,
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
