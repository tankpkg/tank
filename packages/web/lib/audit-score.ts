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

  /**
   * Optional persisted score to keep when scanner data is unavailable.
   * Used by callers to avoid silent score regressions on scan failures.
   */
  previousScore?: number | null;
}

export interface ScoreDetail {
  /** Security-relevant vs non-security quality signal */
  category: 'security' | 'quality';
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

function clampScore(value: number): number {
  return Math.max(0, Math.min(10, value));
}

function makeDetail(
  category: 'security' | 'quality',
  check: string,
  passed: boolean,
  maxPoints: number,
  points?: number
): ScoreDetail {
  return {
    category,
    check,
    passed,
    points: points ?? (passed ? maxPoints : 0),
    maxPoints
  };
}

/**
 * Check whether every top-level key in `extracted` also exists in `declared`.
 * For keys that exist in both, do a deep JSON equality check.
 * If extracted is a subset (all its keys exist in declared with matching
 * values), the check passes.
 */
function extractedPermissionsMatch(declared: Record<string, unknown>, extracted: Record<string, unknown>): boolean {
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

function getSeverityPenalty(severity: string): number {
  switch (severity) {
    case 'critical':
      return 10;
    case 'high':
      return 6;
    case 'medium':
      return 3;
    case 'low':
      return 2;
    default:
      return 3;
  }
}

/**
 * Compute a 0-10 security score for a published skill package.
 *
 * Scoring rules:
 *  - Score is security-first and based on scanner findings only.
 *  - Non-security quality checks (size, file count, docs, metadata) are reported separately
 *    in `details` but never alter `score`.
 *  - When scanner findings are unavailable, callers can preserve a prior score via
 *    `previousScore`; otherwise fallback is 5.0.
 */
export function computeAuditScore(input: AuditScoreInput): AuditScoreResult {
  const { manifest, permissions, fileCount, tarballSize, readme, analysisResults, previousScore } = input;

  // 1. SKILL.md present — if we're scoring, the SKILL.md existed at pack
  //    time. We use manifest.name as a proxy: non-empty means the skill was
  //    properly packaged.
  const skillMdPresent = typeof manifest.name === 'string' && manifest.name.length > 0;

  // 2. Description present in manifest
  const descriptionPresent = typeof manifest.description === 'string' && manifest.description.length > 0;

  // 3. Permissions declared (not empty {})
  const permissionsDeclared = Object.keys(permissions).length > 0;

  // 4. Scanner findings available + no findings present (security-only)
  const hasFindingsData = Array.isArray(analysisResults?.securityIssues);
  const issueCount = hasFindingsData ? analysisResults!.securityIssues!.length : 0;
  const noSecurityIssues = hasFindingsData && issueCount === 0;

  // 5. Permission extraction matches declared (informational only for now)
  let permissionMatch = true;
  if (analysisResults != null && analysisResults.extractedPermissions != null) {
    permissionMatch = extractedPermissionsMatch(permissions, analysisResults.extractedPermissions);
  }

  // 6. File count reasonable (< 100)
  const fileCountOk = fileCount < MAX_FILE_COUNT;

  // 7. Has README/documentation
  const readmePresent = typeof readme === 'string' && readme.trim().length > 0;

  // 8. Package size reasonable (< 5 MB)
  const sizeOk = tarballSize < MAX_TARBALL_SIZE;

  // Security score calculation (non-security checks intentionally excluded)
  let score = 5;

  if (hasFindingsData) {
    const penalty = analysisResults!.securityIssues!.reduce(
      (sum, issue) => sum + getSeverityPenalty(issue.severity),
      0
    );
    score = Math.max(0, 10 - penalty);
  } else if (typeof previousScore === 'number' && Number.isFinite(previousScore)) {
    // Preserve existing persisted score when scanner data is unavailable.
    score = clampScore(previousScore);
  }

  score = Math.round(clampScore(score) * 10) / 10;

  // Build details array — always exactly 8 entries and maxPoints sum to 10.
  // Only security findings contribute to score.
  const details: ScoreDetail[] = [
    makeDetail('quality', 'SKILL.md present', skillMdPresent, 0),
    makeDetail('quality', 'Description present', descriptionPresent, 0),
    makeDetail('quality', 'Permissions declared', permissionsDeclared, 0),
    makeDetail('security', 'Security findings score', noSecurityIssues, 10, score),
    makeDetail('security', 'Permission extraction match (informational)', permissionMatch, 0),
    makeDetail('quality', 'File count reasonable', fileCountOk, 0),
    makeDetail('quality', 'README documentation', readmePresent, 0),
    makeDetail('quality', 'Package size reasonable', sizeOk, 0)
  ];

  return { score, details };
}
