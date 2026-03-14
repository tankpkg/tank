import { describe, expect, it } from 'vitest';
import { type AuditScoreInput, computeAuditScore } from '../audit-score';

function baseInput(): AuditScoreInput {
  return {
    manifest: {
      name: '@tank/test-skill',
      version: '1.0.0',
      description: 'test skill'
    },
    permissions: { network: { outbound: ['*.example.com'] } },
    fileCount: 10,
    tarballSize: 100_000,
    readme: '# docs',
    analysisResults: {
      securityIssues: [],
      extractedPermissions: { network: { outbound: ['*.example.com'] } }
    }
  };
}

describe('computeAuditScore security strictness', () => {
  it('gives 10/10 only when there are zero findings', () => {
    const clean = computeAuditScore(baseInput());
    expect(clean.score).toBe(10);

    const withMedium = baseInput();
    withMedium.analysisResults = {
      securityIssues: [{ severity: 'medium', description: 'suspicious prompt marker' }],
      extractedPermissions: { network: { outbound: ['*.example.com'] } }
    };

    const notes = computeAuditScore(withMedium);
    expect(notes.score).toBeLessThan(10);
  });

  it('does not let non-security checks change security score', () => {
    const hygieneGood = computeAuditScore(baseInput());

    const hygieneBadInput = baseInput();
    hygieneBadInput.fileCount = 10_000;
    hygieneBadInput.tarballSize = 50_000_000;
    hygieneBadInput.readme = null;
    hygieneBadInput.manifest.description = '';

    const hygieneBad = computeAuditScore(hygieneBadInput);
    expect(hygieneBad.score).toBe(hygieneGood.score);
    expect(hygieneBad.score).toBe(10);
  });

  it('drops score for pass_with_notes style scans', () => {
    const input = baseInput();
    input.analysisResults = {
      securityIssues: [{ severity: 'low', description: 'mild heuristic warning' }],
      extractedPermissions: { network: { outbound: ['*.example.com'] } }
    };

    const result = computeAuditScore(input);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThan(10);
  });
});
