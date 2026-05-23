import { ShieldAlert, ShieldCheck } from 'lucide-react';
import type { ScanDetails } from '~/lib/skills/data';

interface TrustSummaryProps {
  scanDetails: ScanDetails;
  onViewDetails?: () => void;
}

export function TrustSummary({ scanDetails, onViewDetails }: TrustSummaryProps) {
  const totalFindings =
    (scanDetails.criticalCount ?? 0) + (scanDetails.highCount ?? 0) + (scanDetails.mediumCount ?? 0);
  const isClean = totalFindings === 0 && scanDetails.verdict === 'pass';

  return (
    <div
      data-testid="trust-summary-card"
      className="rounded-lg border border-tank/15 bg-tank/[0.02] px-4 py-3 flex items-center gap-3 flex-wrap">
      {isClean ? (
        <ShieldCheck className="size-4 text-green-500 shrink-0" />
      ) : (
        <ShieldAlert className="size-4 text-amber-500 shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">
          {isClean ? 'Verified clean' : `Scan completed — ${totalFindings} finding${totalFindings !== 1 ? 's' : ''}`}
        </p>
        <p className="text-xs text-muted-foreground">
          {isClean
            ? 'No security issues detected in the latest scan.'
            : `${scanDetails.criticalCount ?? 0} critical, ${scanDetails.highCount ?? 0} high, ${scanDetails.mediumCount ?? 0} medium — see security tab for details.`}
        </p>
      </div>
      {onViewDetails && (
        <button
          type="button"
          onClick={onViewDetails}
          className="text-xs text-tank hover:underline font-medium shrink-0">
          View details →
        </button>
      )}
    </div>
  );
}
