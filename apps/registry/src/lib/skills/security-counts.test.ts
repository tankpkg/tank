/**
 * Regression: Security tab severity badges and findings list must agree.
 *
 * Bug (prod): @uriva/safescript v0.1.17 displayed "1 medium 3 low" badges
 * with "Verified Safe — No security issues found" headline AND an empty
 * findings list. The badges read pre-computed counts from scan_results
 * (which include every stage), but the findings list filters out advisory
 * stage 'stageT' (Token Usage Analysis). Token-efficiency findings were
 * being painted as security severity badges with nothing to drill into.
 */

import { describe, expect, it } from 'vitest';

import { ADVISORY_STAGES, computeSecurityCounts, isSecurityFinding } from './security-counts';

describe('isSecurityFinding', () => {
  it('returns true for normal scanner stages', () => {
    expect(isSecurityFinding({ stage: 'stage0', severity: 'low' })).toBe(true);
    expect(isSecurityFinding({ stage: 'stage1', severity: 'medium' })).toBe(true);
    expect(isSecurityFinding({ stage: 'stage5', severity: 'critical' })).toBe(true);
  });

  it('returns false for advisory stageT (token usage)', () => {
    expect(isSecurityFinding({ stage: 'stageT', severity: 'medium' })).toBe(false);
    expect(isSecurityFinding({ stage: 'stageT', severity: 'low' })).toBe(false);
  });

  it('treats every entry in ADVISORY_STAGES as non-security', () => {
    for (const stage of ADVISORY_STAGES) {
      expect(isSecurityFinding({ stage, severity: 'critical' })).toBe(false);
    }
  });
});

describe('computeSecurityCounts', () => {
  it('returns zero counts for empty input', () => {
    expect(computeSecurityCounts([])).toEqual({ critical: 0, high: 0, medium: 0, low: 0, info: 0 });
  });

  it('returns zero counts for null/undefined input', () => {
    expect(computeSecurityCounts(null)).toEqual({ critical: 0, high: 0, medium: 0, low: 0, info: 0 });
    expect(computeSecurityCounts(undefined)).toEqual({ critical: 0, high: 0, medium: 0, low: 0, info: 0 });
  });

  it('counts security-stage findings by severity', () => {
    const counts = computeSecurityCounts([
      { stage: 'stage4', severity: 'critical' },
      { stage: 'stage5', severity: 'critical' },
      { stage: 'stage2', severity: 'high' },
      { stage: 'stage3', severity: 'medium' },
      { stage: 'stage3', severity: 'medium' },
      { stage: 'stage1', severity: 'low' },
      { stage: 'stage2', severity: 'info' }
    ]);
    expect(counts).toEqual({ critical: 2, high: 1, medium: 2, low: 1, info: 1 });
  });

  it('excludes stageT findings entirely (the prod regression)', () => {
    const counts = computeSecurityCounts([
      { stage: 'stageT', severity: 'medium' },
      { stage: 'stageT', severity: 'low' },
      { stage: 'stageT', severity: 'low' },
      { stage: 'stageT', severity: 'low' }
    ]);
    expect(counts).toEqual({ critical: 0, high: 0, medium: 0, low: 0, info: 0 });
  });

  it('counts only the security half of a mixed findings list', () => {
    const counts = computeSecurityCounts([
      { stage: 'stage4', severity: 'critical' },
      { stage: 'stageT', severity: 'critical' },
      { stage: 'stage5', severity: 'medium' },
      { stage: 'stageT', severity: 'medium' },
      { stage: 'stageT', severity: 'low' }
    ]);
    expect(counts).toEqual({ critical: 1, high: 0, medium: 1, low: 0, info: 0 });
  });

  it('ignores findings with unknown severity values', () => {
    const counts = computeSecurityCounts([
      { stage: 'stage4', severity: 'urgent' },
      { stage: 'stage4', severity: '' },
      { stage: 'stage4', severity: 'critical' }
    ]);
    expect(counts).toEqual({ critical: 1, high: 0, medium: 0, low: 0, info: 0 });
  });

  it('reproduces the @uriva/safescript prod regression: 4 stageT findings collapse to all-zero security counts', () => {
    const counts = computeSecurityCounts([
      { stage: 'stageT', severity: 'medium' },
      { stage: 'stageT', severity: 'low' },
      { stage: 'stageT', severity: 'low' },
      { stage: 'stageT', severity: 'low' }
    ]);
    expect(counts.critical + counts.high + counts.medium + counts.low + counts.info).toBe(0);
  });
});
