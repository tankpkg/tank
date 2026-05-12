/**
 * Stages whose findings are advisory and must NOT be counted as security
 * findings. The Python scanner currently emits one such stage:
 *
 *   - ``stageT`` (Token Usage Analysis): per its own docstring,
 *     "Advisory-only — findings never affect the scan verdict." These are
 *     surfaced separately on the Token Efficiency tab.
 *
 * The Security tab filters these out of the visible findings list, so the
 * severity badges next to it must use the same filter or the UI will show
 * "1 medium 3 low" alongside an empty findings table — which is what the
 * prod regression looked like for ``@uriva/safescript``.
 */
export const ADVISORY_STAGES: readonly string[] = ['stageT'];

export interface FindingForCounts {
  readonly stage: string;
  readonly severity: string;
}

export interface SeverityCounts {
  critical: number;
  high: number;
  medium: number;
  low: number;
  info: number;
}

export function isSecurityFinding(finding: FindingForCounts): boolean {
  return !ADVISORY_STAGES.includes(finding.stage);
}

export function computeSecurityCounts(findings: readonly FindingForCounts[] | null | undefined): SeverityCounts {
  const counts: SeverityCounts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  if (!findings) return counts;

  for (const f of findings) {
    if (!isSecurityFinding(f)) continue;
    switch (f.severity) {
      case 'critical':
        counts.critical++;
        break;
      case 'high':
        counts.high++;
        break;
      case 'medium':
        counts.medium++;
        break;
      case 'low':
        counts.low++;
        break;
      case 'info':
        counts.info++;
        break;
    }
  }

  return counts;
}
