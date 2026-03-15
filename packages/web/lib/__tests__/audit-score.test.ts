import { describe, expect, it } from 'vitest';
import { type AuditScoreInput, computeAuditScore } from '../audit-score';

function buildInput(overrides: Partial<AuditScoreInput> = {}): AuditScoreInput {
  return {
    manifest: {
      name: '@tank/skill',
      version: '1.0.0',
      description: 'test skill'
    },
    permissions: { network: { outbound: ['*.example.com'] } },
    fileCount: 12,
    tarballSize: 120_000,
    readme: '# docs',
    analysisResults: {
      securityIssues: [],
      extractedPermissions: { network: { outbound: ['*.example.com'] } }
    },
    ...overrides
  };
}

describe('computeAuditScore', () => {
  it('returns 10 only when scanner findings exist and are empty', () => {
    const clean = computeAuditScore(buildInput());
    expect(clean.score).toBe(10);

    const noScan = computeAuditScore(buildInput({ analysisResults: null }));
    expect(noScan.score).toBe(5);
  });

  it('preserves previous score when scanner findings are unavailable', () => {
    const noScanWithPrevious = computeAuditScore(
      buildInput({
        analysisResults: null,
        previousScore: 7.5
      })
    );

    expect(noScanWithPrevious.score).toBe(7.5);
  });

  it('reduces score for any finding severity', () => {
    const low = computeAuditScore(
      buildInput({
        analysisResults: { securityIssues: [{ severity: 'low', description: 'warn' }] }
      })
    );
    const medium = computeAuditScore(
      buildInput({
        analysisResults: { securityIssues: [{ severity: 'medium', description: 'warn' }] }
      })
    );
    const high = computeAuditScore(
      buildInput({
        analysisResults: { securityIssues: [{ severity: 'high', description: 'warn' }] }
      })
    );
    const critical = computeAuditScore(
      buildInput({
        analysisResults: { securityIssues: [{ severity: 'critical', description: 'warn' }] }
      })
    );

    expect(low.score).toBe(8);
    expect(medium.score).toBe(7);
    expect(high.score).toBe(4);
    expect(critical.score).toBe(0);
  });

  it('does not include quality checks in security score', () => {
    const baseline = computeAuditScore(buildInput());
    const qualityOnlyChanges = computeAuditScore(
      buildInput({
        manifest: { name: '', version: '1.0.0', description: '' },
        fileCount: 10_000,
        tarballSize: 50_000_000,
        readme: null
      })
    );

    expect(baseline.score).toBe(10);
    expect(qualityOnlyChanges.score).toBe(10);
  });

  it('keeps permission mismatch as informational-only', () => {
    const mismatch = computeAuditScore(
      buildInput({
        analysisResults: {
          securityIssues: [],
          extractedPermissions: {
            network: { outbound: ['*.evil.com'] },
            filesystem: { read: ['/**'] }
          }
        }
      })
    );

    expect(mismatch.score).toBe(10);
  });

  it('returns both security and quality details', () => {
    const result = computeAuditScore(buildInput());
    const categories = new Set(result.details.map((d) => d.category));
    const totalPoints = result.details.reduce((sum, d) => sum + d.points, 0);
    const totalMaxPoints = result.details.reduce((sum, d) => sum + d.maxPoints, 0);

    expect(result.details).toHaveLength(8);
    expect(categories.has('security')).toBe(true);
    expect(categories.has('quality')).toBe(true);
    expect(totalPoints).toBe(result.score);
    expect(totalMaxPoints).toBe(10);
  });
});
