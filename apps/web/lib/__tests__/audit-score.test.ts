import { describe, it, expect } from 'vitest';
import {
  computeAuditScore,
  type AuditScoreInput,
  type AuditScoreResult,
} from '../audit-score';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a perfect input that should score 10/10 */
function perfectInput(): AuditScoreInput {
  return {
    manifest: {
      name: 'my-skill',
      version: '1.0.0',
      description: 'A useful skill for testing',
      permissions: { network: { outbound: ['*.example.com'] } },
    },
    permissions: { network: { outbound: ['*.example.com'] } },
    fileCount: 10,
    tarballSize: 100_000, // 100 KB
    readme: '# My Skill\n\nSome documentation.',
    analysisResults: {
      securityIssues: [],
      extractedPermissions: { network: { outbound: ['*.example.com'] } },
    },
  };
}

/** Build a minimal/worst input that should score 0/10 */
function worstInput(): AuditScoreInput {
  return {
    manifest: {
      name: '',
      version: '1.0.0',
    },
    permissions: {},
    fileCount: 200,
    tarballSize: 10_000_000, // 10 MB
    readme: null,
    analysisResults: {
      securityIssues: [
        { severity: 'high', description: 'Credential exfiltration detected' },
      ],
      extractedPermissions: { network: { outbound: ['*.evil.com'] } },
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('computeAuditScore', () => {
  // -------------------------------------------------------------------------
  // 1. Perfect score
  // -------------------------------------------------------------------------
  it('returns 10/10 when all checks pass', () => {
    const result = computeAuditScore(perfectInput());
    expect(result.score).toBe(10);
    expect(result.details).toHaveLength(8);
    expect(result.details.every((d) => d.passed)).toBe(true);
    expect(result.details.reduce((sum, d) => sum + d.points, 0)).toBe(10);
  });

  // -------------------------------------------------------------------------
  // 2. Minimal score
  // -------------------------------------------------------------------------
  it('returns 0/10 when all checks fail', () => {
    const result = computeAuditScore(worstInput());
    expect(result.score).toBe(0);
    expect(result.details).toHaveLength(8);
    expect(result.details.every((d) => !d.passed)).toBe(true);
    expect(result.details.reduce((sum, d) => sum + d.points, 0)).toBe(0);
  });

  // -------------------------------------------------------------------------
  // 3. SKILL.md present check (+1)
  // -------------------------------------------------------------------------
  describe('SKILL.md present', () => {
    it('awards +1 when manifest name is non-empty', () => {
      const input = perfectInput();
      const result = computeAuditScore(input);
      const check = result.details.find((d) => d.check.toLowerCase().includes('skill.md'));
      expect(check).toBeDefined();
      expect(check!.passed).toBe(true);
      expect(check!.points).toBe(1);
      expect(check!.maxPoints).toBe(1);
    });

    it('awards 0 when manifest name is empty', () => {
      const input = perfectInput();
      input.manifest.name = '';
      const result = computeAuditScore(input);
      const check = result.details.find((d) => d.check.toLowerCase().includes('skill.md'));
      expect(check).toBeDefined();
      expect(check!.passed).toBe(false);
      expect(check!.points).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // 4. Description present check (+1)
  // -------------------------------------------------------------------------
  describe('description present', () => {
    it('awards +1 when manifest.description is non-empty', () => {
      const input = perfectInput();
      const result = computeAuditScore(input);
      const check = result.details.find((d) => d.check.toLowerCase().includes('description'));
      expect(check).toBeDefined();
      expect(check!.passed).toBe(true);
      expect(check!.points).toBe(1);
      expect(check!.maxPoints).toBe(1);
    });

    it('awards 0 when manifest.description is missing', () => {
      const input = perfectInput();
      delete input.manifest.description;
      const result = computeAuditScore(input);
      const check = result.details.find((d) => d.check.toLowerCase().includes('description'));
      expect(check!.passed).toBe(false);
      expect(check!.points).toBe(0);
    });

    it('awards 0 when manifest.description is empty string', () => {
      const input = perfectInput();
      input.manifest.description = '';
      const result = computeAuditScore(input);
      const check = result.details.find((d) => d.check.toLowerCase().includes('description'));
      expect(check!.passed).toBe(false);
      expect(check!.points).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // 5. Permissions declared check (+1)
  // -------------------------------------------------------------------------
  describe('permissions declared', () => {
    it('awards +1 when permissions is non-empty object', () => {
      const input = perfectInput();
      const result = computeAuditScore(input);
      const check = result.details.find((d) => d.check.toLowerCase().includes('permissions declared'));
      expect(check).toBeDefined();
      expect(check!.passed).toBe(true);
      expect(check!.points).toBe(1);
      expect(check!.maxPoints).toBe(1);
    });

    it('awards 0 when permissions is empty object', () => {
      const input = perfectInput();
      input.permissions = {};
      const result = computeAuditScore(input);
      const check = result.details.find((d) => d.check.toLowerCase().includes('permissions declared'));
      expect(check!.passed).toBe(false);
      expect(check!.points).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // 6. No security issues check (+2)
  // -------------------------------------------------------------------------
  describe('no security issues', () => {
    it('awards +2 when analysisResults is null (no analysis ran)', () => {
      const input = perfectInput();
      input.analysisResults = null;
      const result = computeAuditScore(input);
      const check = result.details.find((d) => d.check.toLowerCase().includes('security'));
      expect(check).toBeDefined();
      expect(check!.passed).toBe(true);
      expect(check!.points).toBe(2);
      expect(check!.maxPoints).toBe(2);
    });

    it('awards +2 when analysisResults is undefined', () => {
      const input = perfectInput();
      delete input.analysisResults;
      const result = computeAuditScore(input);
      const check = result.details.find((d) => d.check.toLowerCase().includes('security'));
      expect(check!.passed).toBe(true);
      expect(check!.points).toBe(2);
    });

    it('awards +2 when securityIssues is empty array', () => {
      const input = perfectInput();
      input.analysisResults = { securityIssues: [] };
      const result = computeAuditScore(input);
      const check = result.details.find((d) => d.check.toLowerCase().includes('security'));
      expect(check!.passed).toBe(true);
      expect(check!.points).toBe(2);
    });

    it('awards +2 when securityIssues is undefined in analysisResults', () => {
      const input = perfectInput();
      input.analysisResults = {};
      const result = computeAuditScore(input);
      const check = result.details.find((d) => d.check.toLowerCase().includes('security'));
      expect(check!.passed).toBe(true);
      expect(check!.points).toBe(2);
    });

    it('awards 0 when securityIssues is non-empty', () => {
      const input = perfectInput();
      input.analysisResults = {
        securityIssues: [
          { severity: 'high', description: 'Credential exfiltration' },
        ],
      };
      const result = computeAuditScore(input);
      const check = result.details.find((d) => d.check.toLowerCase().includes('security'));
      expect(check!.passed).toBe(false);
      expect(check!.points).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // 7. Permission extraction matches declared (+2)
  // -------------------------------------------------------------------------
  describe('permission match', () => {
    it('awards +2 when analysisResults is null (default pass)', () => {
      const input = perfectInput();
      input.analysisResults = null;
      const result = computeAuditScore(input);
      const check = result.details.find((d) => d.check.toLowerCase().includes('permission') && d.check.toLowerCase().includes('match'));
      expect(check).toBeDefined();
      expect(check!.passed).toBe(true);
      expect(check!.points).toBe(2);
      expect(check!.maxPoints).toBe(2);
    });

    it('awards +2 when extractedPermissions is undefined', () => {
      const input = perfectInput();
      input.analysisResults = { securityIssues: [] };
      const result = computeAuditScore(input);
      const check = result.details.find((d) => d.check.toLowerCase().includes('permission') && d.check.toLowerCase().includes('match'));
      expect(check!.passed).toBe(true);
      expect(check!.points).toBe(2);
    });

    it('awards +2 when extracted permissions match declared', () => {
      const input = perfectInput();
      // Both have the same permissions
      const result = computeAuditScore(input);
      const check = result.details.find((d) => d.check.toLowerCase().includes('permission') && d.check.toLowerCase().includes('match'));
      expect(check!.passed).toBe(true);
      expect(check!.points).toBe(2);
    });

    it('awards +2 when extracted is a subset of declared', () => {
      const input = perfectInput();
      input.permissions = {
        network: { outbound: ['*.example.com'] },
        filesystem: { read: ['./src/**'] },
      };
      input.analysisResults = {
        securityIssues: [],
        extractedPermissions: { network: { outbound: ['*.example.com'] } },
      };
      const result = computeAuditScore(input);
      const check = result.details.find((d) => d.check.toLowerCase().includes('permission') && d.check.toLowerCase().includes('match'));
      expect(check!.passed).toBe(true);
      expect(check!.points).toBe(2);
    });

    it('awards 0 when extracted permissions have undeclared domains', () => {
      const input = perfectInput();
      input.permissions = { network: { outbound: ['*.example.com'] } };
      input.analysisResults = {
        securityIssues: [],
        extractedPermissions: {
          network: { outbound: ['*.example.com'] },
          filesystem: { read: ['./secrets/**'] },
        },
      };
      const result = computeAuditScore(input);
      const check = result.details.find((d) => d.check.toLowerCase().includes('permission') && d.check.toLowerCase().includes('match'));
      expect(check!.passed).toBe(false);
      expect(check!.points).toBe(0);
    });

    it('awards 0 when extracted permissions differ from declared', () => {
      const input = perfectInput();
      input.permissions = { network: { outbound: ['*.safe.com'] } };
      input.analysisResults = {
        securityIssues: [],
        extractedPermissions: { network: { outbound: ['*.evil.com'] } },
      };
      const result = computeAuditScore(input);
      const check = result.details.find((d) => d.check.toLowerCase().includes('permission') && d.check.toLowerCase().includes('match'));
      expect(check!.passed).toBe(false);
      expect(check!.points).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // 8. File count reasonable check (+1)
  // -------------------------------------------------------------------------
  describe('file count reasonable', () => {
    it('awards +1 when fileCount < 100', () => {
      const input = perfectInput();
      input.fileCount = 99;
      const result = computeAuditScore(input);
      const check = result.details.find((d) => d.check.toLowerCase().includes('file count'));
      expect(check).toBeDefined();
      expect(check!.passed).toBe(true);
      expect(check!.points).toBe(1);
      expect(check!.maxPoints).toBe(1);
    });

    it('awards 0 when fileCount >= 100', () => {
      const input = perfectInput();
      input.fileCount = 100;
      const result = computeAuditScore(input);
      const check = result.details.find((d) => d.check.toLowerCase().includes('file count'));
      expect(check!.passed).toBe(false);
      expect(check!.points).toBe(0);
    });

    it('awards 0 when fileCount is very large', () => {
      const input = perfectInput();
      input.fileCount = 5000;
      const result = computeAuditScore(input);
      const check = result.details.find((d) => d.check.toLowerCase().includes('file count'));
      expect(check!.passed).toBe(false);
      expect(check!.points).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // 9. Readme present check (+1)
  // -------------------------------------------------------------------------
  describe('readme present', () => {
    it('awards +1 when readme is non-null and non-empty', () => {
      const input = perfectInput();
      const result = computeAuditScore(input);
      const check = result.details.find((d) => d.check.toLowerCase().includes('readme'));
      expect(check).toBeDefined();
      expect(check!.passed).toBe(true);
      expect(check!.points).toBe(1);
      expect(check!.maxPoints).toBe(1);
    });

    it('awards 0 when readme is null', () => {
      const input = perfectInput();
      input.readme = null;
      const result = computeAuditScore(input);
      const check = result.details.find((d) => d.check.toLowerCase().includes('readme'));
      expect(check!.passed).toBe(false);
      expect(check!.points).toBe(0);
    });

    it('awards 0 when readme is empty string', () => {
      const input = perfectInput();
      input.readme = '';
      const result = computeAuditScore(input);
      const check = result.details.find((d) => d.check.toLowerCase().includes('readme'));
      expect(check!.passed).toBe(false);
      expect(check!.points).toBe(0);
    });

    it('awards 0 when readme is whitespace only', () => {
      const input = perfectInput();
      input.readme = '   \n\t  ';
      const result = computeAuditScore(input);
      const check = result.details.find((d) => d.check.toLowerCase().includes('readme'));
      expect(check!.passed).toBe(false);
      expect(check!.points).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // 10. Package size reasonable check (+1)
  // -------------------------------------------------------------------------
  describe('package size reasonable', () => {
    it('awards +1 when tarballSize < 5MB', () => {
      const input = perfectInput();
      input.tarballSize = 5_242_879; // 1 byte under 5MB
      const result = computeAuditScore(input);
      const check = result.details.find((d) => d.check.toLowerCase().includes('package size'));
      expect(check).toBeDefined();
      expect(check!.passed).toBe(true);
      expect(check!.points).toBe(1);
      expect(check!.maxPoints).toBe(1);
    });

    it('awards 0 when tarballSize >= 5MB', () => {
      const input = perfectInput();
      input.tarballSize = 5_242_880; // exactly 5MB
      const result = computeAuditScore(input);
      const check = result.details.find((d) => d.check.toLowerCase().includes('package size'));
      expect(check!.passed).toBe(false);
      expect(check!.points).toBe(0);
    });

    it('awards 0 when tarballSize is very large', () => {
      const input = perfectInput();
      input.tarballSize = 50_000_000; // 50MB
      const result = computeAuditScore(input);
      const check = result.details.find((d) => d.check.toLowerCase().includes('package size'));
      expect(check!.passed).toBe(false);
      expect(check!.points).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // 11. Score clamping
  // -------------------------------------------------------------------------
  it('score is always between 0 and 10', () => {
    // Perfect input
    const perfect = computeAuditScore(perfectInput());
    expect(perfect.score).toBeGreaterThanOrEqual(0);
    expect(perfect.score).toBeLessThanOrEqual(10);

    // Worst input
    const worst = computeAuditScore(worstInput());
    expect(worst.score).toBeGreaterThanOrEqual(0);
    expect(worst.score).toBeLessThanOrEqual(10);
  });

  // -------------------------------------------------------------------------
  // 12. Always returns exactly 8 details
  // -------------------------------------------------------------------------
  it('always returns exactly 8 detail entries', () => {
    const result1 = computeAuditScore(perfectInput());
    expect(result1.details).toHaveLength(8);

    const result2 = computeAuditScore(worstInput());
    expect(result2.details).toHaveLength(8);

    // With no analysis results
    const input3 = perfectInput();
    input3.analysisResults = null;
    const result3 = computeAuditScore(input3);
    expect(result3.details).toHaveLength(8);
  });

  // -------------------------------------------------------------------------
  // 13. Max points sum to 10
  // -------------------------------------------------------------------------
  it('maxPoints across all details sum to 10', () => {
    const result = computeAuditScore(perfectInput());
    const totalMax = result.details.reduce((sum, d) => sum + d.maxPoints, 0);
    expect(totalMax).toBe(10);
  });

  // -------------------------------------------------------------------------
  // 14. Score equals sum of points
  // -------------------------------------------------------------------------
  it('score equals sum of awarded points', () => {
    const result = computeAuditScore(perfectInput());
    const sumPoints = result.details.reduce((sum, d) => sum + d.points, 0);
    expect(result.score).toBe(sumPoints);

    const worst = computeAuditScore(worstInput());
    const worstSum = worst.details.reduce((sum, d) => sum + d.points, 0);
    expect(worst.score).toBe(worstSum);
  });

  // -------------------------------------------------------------------------
  // 15. Partial score — mixed pass/fail
  // -------------------------------------------------------------------------
  it('computes correct partial score with mixed results', () => {
    const input = perfectInput();
    // Fail: no description (-1), empty permissions (-1), large file count (-1)
    delete input.manifest.description;
    input.permissions = {};
    input.fileCount = 150;
    // Permission match also fails: extracted has keys not in declared (empty)
    // Pass: SKILL.md (+1), no security issues (+2), readme (+1), size (+1) = 5
    // Fail: description (0), permissions declared (0), permission match (0), file count (0) = 0
    const result = computeAuditScore(input);
    expect(result.score).toBe(5); // 1+0+0+2+0+0+1+1 = 5
  });
});
