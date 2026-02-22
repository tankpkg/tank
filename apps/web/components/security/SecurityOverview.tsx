'use client';

import { Badge } from '@/components/ui/badge';

interface SecurityOverviewProps {
  score: number | null;
  verdict: string | null;
  durationMs: number | null;
  scannedAt: string | null;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
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

function getScoreColor(score: number): string {
  if (score >= 9) return 'text-green-500';
  if (score >= 7) return 'text-green-600';
  if (score >= 5) return 'text-yellow-600';
  if (score >= 3) return 'text-orange-600';
  return 'text-red-600';
}

function getProgressBarColor(score: number): string {
  if (score >= 9) return 'bg-green-500';
  if (score >= 7) return 'bg-green-600';
  if (score >= 5) return 'bg-yellow-500';
  if (score >= 3) return 'bg-orange-500';
  return 'bg-red-500';
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
}: SecurityOverviewProps) {
  const verdictStyles = getVerdictStyles(verdict);
  const displayScore = score ?? 0;
  const scoreColor = score !== null ? getScoreColor(score) : 'text-gray-400';
  const progressColor = score !== null ? getProgressBarColor(score) : 'bg-gray-300';

  return (
    <div className="bg-card border rounded-lg p-6">
      <div className="flex items-center justify-between">
        {/* Score Section */}
        <div className="flex items-center gap-6">
          <div className="text-center">
            <div className={`text-5xl font-bold ${scoreColor}`}>
              {score !== null ? score : '—'}
            </div>
            <div className="text-sm text-muted-foreground mt-1">Security Score</div>
          </div>
          <div className="w-32">
            <div className="h-3 bg-muted rounded-full overflow-hidden">
              <div
                className={`h-full ${progressColor} transition-all duration-500`}
                style={{ width: `${(displayScore / 10) * 100}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-muted-foreground mt-1">
              <span>0</span>
              <span>10</span>
            </div>
          </div>
        </div>

        {/* Verdict Badge */}
        <div className="text-center">
          <Badge className={`${verdictStyles.bg} ${verdictStyles.text} text-base px-4 py-1.5`}>
            {verdictStyles.label}
          </Badge>
          <div className="text-xs text-muted-foreground mt-2">
            {scannedAt ? `Scanned ${timeAgo(scannedAt)}` : 'Not scanned'}
          </div>
          {durationMs && (
            <div className="text-xs text-muted-foreground">
              Duration: {(durationMs / 1000).toFixed(1)}s
            </div>
          )}
        </div>

        {/* Finding Counts */}
        <div className="flex gap-4">
          {criticalCount > 0 && (
            <div className="text-center">
              <div className="text-2xl font-bold text-red-600">{criticalCount}</div>
              <div className="text-xs text-muted-foreground">Critical</div>
            </div>
          )}
          {highCount > 0 && (
            <div className="text-center">
              <div className="text-2xl font-bold text-orange-600">{highCount}</div>
              <div className="text-xs text-muted-foreground">High</div>
            </div>
          )}
          {mediumCount > 0 && (
            <div className="text-center">
              <div className="text-2xl font-bold text-yellow-600">{mediumCount}</div>
              <div className="text-xs text-muted-foreground">Medium</div>
            </div>
          )}
          {lowCount > 0 && (
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">{lowCount}</div>
              <div className="text-xs text-muted-foreground">Low</div>
            </div>
          )}
          {criticalCount === 0 && highCount === 0 && mediumCount === 0 && lowCount === 0 && (
            <div className="text-center">
              <div className="text-2xl text-green-600">✓</div>
              <div className="text-xs text-muted-foreground">No Issues</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
