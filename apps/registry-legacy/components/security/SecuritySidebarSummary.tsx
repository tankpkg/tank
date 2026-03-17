'use client';

import { computeTrustLevel } from '@/lib/trust-level';
import { TrustBadge } from './TrustBadge';

interface SecuritySidebarSummaryProps {
  verdict: string | null;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
}

/**
 * Compact security summary for skill page sidebar.
 * Replaces the old numeric score display with trust-level-based status.
 */
export function SecuritySidebarSummary({
  verdict,
  criticalCount,
  highCount,
  mediumCount,
  lowCount
}: SecuritySidebarSummaryProps) {
  const trustLevel = computeTrustLevel(verdict, criticalCount, highCount, mediumCount, lowCount);
  const totalFindings = criticalCount + highCount + mediumCount + lowCount;

  // Build description based on trust level and findings
  const getDescription = (): string => {
    if (trustLevel === 'pending') {
      return 'Awaiting security scan';
    }
    if (trustLevel === 'verified') {
      return 'Clean security scan';
    }
    if (totalFindings === 0) {
      return 'No security issues';
    }

    // Build findings summary
    const parts: string[] = [];
    if (criticalCount > 0) parts.push(`${criticalCount} critical`);
    if (highCount > 0) parts.push(`${highCount} high`);
    if (mediumCount > 0) parts.push(`${mediumCount} medium`);
    if (lowCount > 0) parts.push(`${lowCount} low`);

    return `${parts.join(', ')} ${totalFindings === 1 ? 'finding' : 'findings'}`;
  };

  return (
    <div className="space-y-3">
      {/* Trust Badge */}
      <TrustBadge
        trustLevel={trustLevel}
        findings={{ critical: criticalCount, high: highCount, medium: mediumCount, low: lowCount }}
        size="sm"
      />

      {/* Description */}
      <p className="text-xs text-muted-foreground">{getDescription()}</p>
    </div>
  );
}
