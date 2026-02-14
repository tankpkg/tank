// ---------------------------------------------------------------------------
// Audit Score Computation
// Pure function — no side effects, no DB access, no imports from @/lib/db
// ---------------------------------------------------------------------------

export interface AuditScoreInput {
  /** From the skill version record */
  manifest: {
    name: string;
    version: string;
    description?: string;
    permissions?: Record<string, unknown>;
    [key: string]: unknown;
  };
  /** From skill_versions.permissions (JSONB) */
  permissions: Record<string, unknown>;
  /** From skill_versions.fileCount */
  fileCount: number;
  /** From skill_versions.tarballSize (bytes) */
  tarballSize: number;
  /** From skill_versions.readme (nullable text) */
  readme: string | null;

  /** From security analysis (optional — may not be available yet) */
  analysisResults?: {
    securityIssues?: Array<{ severity: string; description: string }>;
    extractedPermissions?: Record<string, unknown>;
  } | null;
}

export interface ScoreDetail {
  /** Human-readable check name */
  check: string;
  /** Did this check pass? */
  passed: boolean;
  /** Points awarded (0 if failed) */
  points: number;
  /** Maximum possible points for this check */
  maxPoints: number;
}

export interface AuditScoreResult {
  /** 0-10 */
  score: number;
  /** Exactly 8 entries, one per check */
  details: ScoreDetail[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_FILE_COUNT = 100;
const MAX_TARBALL_SIZE = 5_242_880; // 5 MB

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function makeDetail(
  check: string,
  passed: boolean,
  maxPoints: number,
): ScoreDetail {
  return { check, passed, points: passed ? maxPoints : 0, maxPoints };
}

/**
 * Check whether every top-level key in `extracted` also exists in `declared`.
 * For keys that exist in both, do a deep JSON equality check.
 * If extracted is a subset (all its keys exist in declared with matching
 * values), the check passes.
 */
function extractedPermissionsMatch(
  declared: Record<string, unknown>,
  extracted: Record<string, unknown>,
): boolean {
  for (const key of Object.keys(extracted)) {
    if (!(key in declared)) return false;
    // Deep compare the value for this domain
    if (JSON.stringify(declared[key]) !== JSON.stringify(extracted[key])) {
      return false;
    }
  }
  return true;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

/**
 * Compute a 0-10 audit score based on available signals from a published
 * skill package.
 *
 * Scoring rubric:
 *  - SKILL.md present (manifest name non-empty): +1
 *  - Description present in manifest: +1
 *  - Permissions declared (not empty {}): +1
 *  - No security issues found: +2 (default pass if no analysis)
 *  - Permission extraction matches declared: +2 (default pass if no analysis)
 *  - File count reasonable (< 100): +1
 *  - Has README/documentation: +1
 *  - Package size reasonable (< 5 MB): +1
 */
export function computeAuditScore(input: AuditScoreInput): AuditScoreResult {
  const { manifest, permissions, fileCount, tarballSize, readme, analysisResults } = input;

  // 1. SKILL.md present — if we're scoring, the SKILL.md existed at pack
  //    time. We use manifest.name as a proxy: non-empty means the skill was
  //    properly packaged.
  const skillMdPresent = typeof manifest.name === 'string' && manifest.name.length > 0;

  // 2. Description present in manifest
  const descriptionPresent =
    typeof manifest.description === 'string' && manifest.description.length > 0;

  // 3. Permissions declared (not empty {})
  const permissionsDeclared = Object.keys(permissions).length > 0;

  // 4. No security issues found (+2, default pass if no analysis ran)
  const noSecurityIssues =
    analysisResults == null ||
    analysisResults.securityIssues == null ||
    analysisResults.securityIssues.length === 0;

  // 5. Permission extraction matches declared (+2, default pass if no analysis)
  let permissionMatch = true;
  if (
    analysisResults != null &&
    analysisResults.extractedPermissions != null
  ) {
    permissionMatch = extractedPermissionsMatch(
      permissions,
      analysisResults.extractedPermissions,
    );
  }

  // 6. File count reasonable (< 100)
  const fileCountOk = fileCount < MAX_FILE_COUNT;

  // 7. Has README/documentation
  const readmePresent =
    typeof readme === 'string' && readme.trim().length > 0;

  // 8. Package size reasonable (< 5 MB)
  const sizeOk = tarballSize < MAX_TARBALL_SIZE;

  // Build details array — always exactly 8 entries
  const details: ScoreDetail[] = [
    makeDetail('SKILL.md present', skillMdPresent, 1),
    makeDetail('Description present', descriptionPresent, 1),
    makeDetail('Permissions declared', permissionsDeclared, 1),
    makeDetail('No security issues', noSecurityIssues, 2),
    makeDetail('Permission extraction match', permissionMatch, 2),
    makeDetail('File count reasonable', fileCountOk, 1),
    makeDetail('README documentation', readmePresent, 1),
    makeDetail('Package size reasonable', sizeOk, 1),
  ];

  // Score = sum of awarded points, clamped to [0, 10]
  const rawScore = details.reduce((sum, d) => sum + d.points, 0);
  const score = Math.max(0, Math.min(10, rawScore));

  return { score, details };
}
