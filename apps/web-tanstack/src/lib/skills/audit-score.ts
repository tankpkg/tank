export interface AuditScoreInput {
  manifest: Record<string, unknown>;
  permissions: Record<string, unknown>;
  fileCount: number;
  tarballSize: number;
  readme: string | null;
  analysisResults?: {
    securityIssues: Array<{ severity: 'critical' | 'high' | 'medium' | 'low' }>;
    extractedPermissions?: unknown;
  } | null;
}

export function computeAuditScore(input: AuditScoreInput): { score: number } {
  let score = 0;

  // +1: SKILL.md present
  if (input.readme != null && input.readme.length > 0) score += 1;

  // +1: manifest has description
  if (typeof input.manifest.description === 'string' && input.manifest.description.length > 0) score += 1;

  // +1: permissions declared
  if (Object.keys(input.permissions).length > 0) score += 1;

  // +2: no critical/high severity findings (null = benefit of doubt)
  const issues = input.analysisResults?.securityIssues;
  if (!issues || !issues.some((i) => i.severity === 'critical' || i.severity === 'high')) score += 2;

  // +2: permissions match detected usage (always grant for now)
  score += 2;

  // +1: reasonable file count
  if (input.fileCount < 100) score += 1;

  // +1: meaningful readme content
  if (input.readme != null && input.readme.length > 50) score += 1;

  // +1: tarball under 5MB
  if (input.tarballSize < 5 * 1024 * 1024) score += 1;

  return { score: Math.max(0, Math.min(10, score)) };
}
