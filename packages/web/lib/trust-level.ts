// ---------------------------------------------------------------------------
// Trust Badge System
// Pure functions — no side effects, no DB access, no imports from @/lib/db
// Intent: .idd/modules/trust-badge/INTENT.md
// ---------------------------------------------------------------------------

/**
 * Trust levels derived from scan verdict and findings.
 *
 * | Level | Display | Verdict | Findings |
 * |-------|---------|---------|----------|
 * | `verified` | 🛡️ Verified | pass | 0 |
 * | `review_recommended` | ⚠️ Review Recommended | pass_with_notes | any |
 * | `concerns` | 🚨 Concerns | flagged | any |
 * | `unsafe` | ✗ Unsafe | fail | any |
 * | `pending` | ○ Pending | null | - |
 */
export type TrustLevel = 'pending' | 'verified' | 'review_recommended' | 'concerns' | 'unsafe';

export interface TrustBadgeConfig {
  level: TrustLevel;
  icon: string;
  label: string;
  bgClass: string;
  textClass: string;
  color: string; // For SVG badges
}

/**
 * Compute trust level from scan verdict and finding counts.
 *
 * Constraints (from INTENT.md):
 * - C1: Only PASS+0 = verified (unscanned is not verified)
 */
export function computeTrustLevel(
  verdict: string | null,
  criticalCount: number,
  highCount: number,
  mediumCount: number,
  lowCount: number
): TrustLevel {
  if (!verdict) return 'pending';
  if (verdict === 'fail') return 'unsafe';
  if (verdict === 'flagged') return 'concerns';
  if (verdict === 'pass_with_notes') return 'review_recommended';
  if (verdict === 'pass') {
    // PASS with 0 findings = truly verified
    const totalFindings = criticalCount + highCount + mediumCount + lowCount;
    return totalFindings === 0 ? 'verified' : 'review_recommended';
  }
  // Unknown verdict - treat as pending
  return 'pending';
}

/**
 * Get display configuration for a trust level.
 */
export function getTrustBadgeConfig(level: TrustLevel): TrustBadgeConfig {
  const configs: Record<TrustLevel, TrustBadgeConfig> = {
    verified: {
      level: 'verified',
      icon: 'shield-check',
      label: 'Verified',
      bgClass: 'bg-green-100 dark:bg-green-900/30',
      textClass: 'text-green-700 dark:text-green-400',
      color: '#4c1'
    },
    review_recommended: {
      level: 'review_recommended',
      icon: 'alert-triangle',
      label: 'Review Recommended',
      bgClass: 'bg-yellow-100 dark:bg-yellow-900/30',
      textClass: 'text-yellow-700 dark:text-yellow-400',
      color: '#dfb317'
    },
    concerns: {
      level: 'concerns',
      icon: 'alert-octagon',
      label: 'Concerns',
      bgClass: 'bg-orange-100 dark:bg-orange-900/30',
      textClass: 'text-orange-700 dark:text-orange-400',
      color: '#e05d44'
    },
    unsafe: {
      level: 'unsafe',
      icon: 'x-circle',
      label: 'Unsafe',
      bgClass: 'bg-red-100 dark:bg-red-900/30',
      textClass: 'text-red-700 dark:text-red-400',
      color: '#e05d44'
    },
    pending: {
      level: 'pending',
      icon: 'clock',
      label: 'Pending',
      bgClass: 'bg-gray-100 dark:bg-gray-900/30',
      textClass: 'text-gray-600 dark:text-gray-400',
      color: '#9f9f9f'
    }
  };
  return configs[level];
}

/**
 * Badge API helper (no React dependency).
 * Returns config for SVG badge rendering.
 */
export function getTrustBadgeApiConfig(
  verdict: string | null,
  totalFindings: number
): { label: string; color: string; value: string } {
  const level = computeTrustLevel(verdict, 0, 0, 0, 0);
  const config = getTrustBadgeConfig(level);

  if (level === 'verified') {
    return { label: 'tank', color: config.color, value: 'verified' };
  }
  if (level === 'review_recommended') {
    return { label: 'tank', color: config.color, value: `${totalFindings} notes` };
  }
  return { label: 'tank', color: config.color, value: config.label.toLowerCase() };
}

/**
 * Get trust level order for sorting (higher = more secure).
 */
export function getTrustLevelOrder(level: TrustLevel): number {
  const order: Record<TrustLevel, number> = {
    verified: 4,
    review_recommended: 3,
    concerns: 2,
    unsafe: 1,
    pending: 0
  };
  return order[level];
}
