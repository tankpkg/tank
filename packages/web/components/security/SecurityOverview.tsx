'use client';

import { Brain } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { TrustBadge } from './TrustBadge';
import { computeTrustLevel } from '@/lib/trust-level';

interface LLMAnalysisInfo {
  enabled: boolean;
  mode: string;
  providers?: Array<{
    name: string;
    model: string;
    status: string;
    latency_ms: number | null;
  }>;
}

interface SecurityOverviewProps {
  score: number | null; // Kept for API compatibility but not displayed
  verdict: string | null;
  durationMs: number | null;
  scannedAt: string | null;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  llmAnalysis?: LLMAnalysisInfo | null;
}

function timeAgo(date: string): string {
  const d = new Date(date);
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

function getVerdictStyles(verdict: string | null): { bg: string; text: string; label: string } {
  switch (verdict) {
    case 'pass':
      return { bg: 'bg-green-600', text: 'text-white', label: 'PASS' };
    case 'pass_with_notes':
      return { bg: 'bg-yellow-600', text: 'text-white', label: 'PASS WITH NOTES' };
    case 'flagged':
      return { bg: 'bg-orange-600', text: 'text-white', label: 'FLAGGED' };
    case 'fail':
      return { bg: 'bg-red-600', text: 'text-white', label: 'FAIL' };
    default:
      return { bg: 'bg-gray-400', text: 'text-white', label: 'PENDING' };
  }
}

export function SecurityOverview({
  score: _score, // Unused - kept for API compatibility
  verdict,
  durationMs,
  scannedAt,
  criticalCount,
  highCount,
  mediumCount,
  lowCount,
  llmAnalysis
}: SecurityOverviewProps) {
  const verdictStyles = getVerdictStyles(verdict);
  const trustLevel = computeTrustLevel(verdict, criticalCount, highCount, mediumCount, lowCount);
  const totalFindings = criticalCount + highCount + mediumCount + lowCount;

  return (
    <div className="bg-card border rounded-lg p-6">
      <div className="flex flex-col gap-4">
        {/* Trust Badge + Scan Metadata */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <TrustBadge
              trustLevel={trustLevel}
              findings={{ critical: criticalCount, high: highCount, medium: mediumCount, low: lowCount }}
              size="md"
            />
            <div className="text-sm text-muted-foreground">
              {trustLevel === 'verified'
                ? 'No security findings detected'
                : trustLevel === 'pending'
                  ? 'Awaiting security scan'
                  : totalFindings === 1
                    ? '1 finding requires attention'
                    : `${totalFindings} findings require attention`}
            </div>
          </div>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            {scannedAt && <span>Scanned {timeAgo(scannedAt)}</span>}
            {durationMs && <span>Duration: {(durationMs / 1000).toFixed(1)}s</span>}
          </div>
        </div>

        {/* Verdict Badge + Finding Counts */}
        <div className="flex items-center justify-between">
          <Badge className={`${verdictStyles.bg} ${verdictStyles.text} text-sm px-3 py-1`}>{verdictStyles.label}</Badge>

          {/* Finding Counts */}
          <div className="flex gap-4">
            {criticalCount > 0 && (
              <div className="text-center">
                <div className="text-lg font-bold text-red-600">{criticalCount}</div>
                <div className="text-xs text-muted-foreground">Critical</div>
              </div>
            )}
            {highCount > 0 && (
              <div className="text-center">
                <div className="text-lg font-bold text-orange-600">{highCount}</div>
                <div className="text-xs text-muted-foreground">High</div>
              </div>
            )}
            {mediumCount > 0 && (
              <div className="text-center">
                <div className="text-lg font-bold text-yellow-600">{mediumCount}</div>
                <div className="text-xs text-muted-foreground">Medium</div>
              </div>
            )}
            {lowCount > 0 && (
              <div className="text-center">
                <div className="text-lg font-bold text-blue-600">{lowCount}</div>
                <div className="text-xs text-muted-foreground">Low</div>
              </div>
            )}
            {totalFindings === 0 && (
              <div className="text-center">
                <div className="text-lg text-green-600">✓</div>
                <div className="text-xs text-muted-foreground">No Issues</div>
              </div>
            )}
          </div>

          {/* LLM Analysis Status */}
          {llmAnalysis?.enabled && (
            <div className="flex items-center gap-2 text-sm">
              <Brain className="w-4 h-4 text-purple-500" />
              <span className="text-muted-foreground">LLM:</span>
              <Badge variant="outline" className="text-xs bg-purple-50 border-purple-200 text-purple-700">
                {llmAnalysis.mode === 'byollm' ? 'Custom' : llmAnalysis.mode === 'builtin' ? 'Built-in' : 'Off'}
              </Badge>
              {llmAnalysis.providers && llmAnalysis.providers.length > 0 ? (
                <span className="text-xs text-muted-foreground">({llmAnalysis.providers[0].model})</span>
              ) : (llmAnalysis as { provider_used?: string }).provider_used ? (
                <span className="text-xs text-muted-foreground">
                  ({(llmAnalysis as { provider_used?: string }).provider_used})
                </span>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
