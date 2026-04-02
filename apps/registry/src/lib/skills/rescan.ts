import { desc, eq } from 'drizzle-orm';

import { env } from '~/consts/env';
import { db } from '~/lib/db';
import { auditEvents, scanFindings, scanResults, skills, skillVersions } from '~/lib/db/schema';
import { depAuditService } from '~/lib/dep-audit/service';
import { getStorageProvider } from '~/services/storage/provider';

export interface RescanResult {
  success: true;
  scanId: string;
  verdict: string;
  findingsCount: number;
  version: string;
}

/**
 * Run a full rescan for a skill: Python scanner + dep audit.
 * Called from admin UI and the Hono API route — no HTTP self-call needed.
 */
export async function runRescan(skillId: string, adminUserId: string): Promise<RescanResult> {
  const scanApiUrl = env.PYTHON_API_URL;
  if (!scanApiUrl) {
    throw new Error('Scanner not configured');
  }

  // Look up skill + latest version
  const [row] = await db
    .select({
      skillName: skills.name,
      versionId: skillVersions.id,
      version: skillVersions.version,
      tarballPath: skillVersions.tarballPath,
      manifest: skillVersions.manifest,
      permissions: skillVersions.permissions
    })
    .from(skills)
    .innerJoin(skillVersions, eq(skillVersions.skillId, skills.id))
    .where(eq(skills.id, skillId))
    .orderBy(desc(skillVersions.createdAt))
    .limit(1);

  if (!row) {
    throw new Error('Package or version not found');
  }

  // Generate signed URL for tarball
  const { signedUrl } = await getStorageProvider().createSignedUrl(row.tarballPath, 3600, 'public');

  // Call Python scanner
  const scanResponse = await fetch(`${scanApiUrl}/api/analyze/scan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tarball_url: signedUrl,
      version_id: row.versionId,
      manifest: row.manifest,
      permissions: row.permissions
    })
  });

  if (!scanResponse.ok) {
    const body = await scanResponse.text().catch(() => 'unreadable');
    throw new Error(`Scanner returned ${scanResponse.status}: ${body}`);
  }

  const scanResult = (await scanResponse.json().catch(() => null)) as {
    verdict?: string | null;
    findings?: Array<{
      stage: string;
      severity: string;
      type: string;
      description: string;
      location?: string | null;
      confidence?: number | null;
      tool?: string | null;
      evidence?: string | null;
      llm_verdict?: string | null;
      llm_reviewed?: boolean;
    }>;
    stage_results?: Array<{ stage: string }>;
    duration_ms?: number;
    file_hashes?: Record<string, string>;
    llm_analysis?: Record<string, unknown>;
  } | null;

  if (!scanResult?.verdict || !scanResult.findings) {
    throw new Error('Scanner returned invalid result');
  }

  const findings = scanResult.findings;
  const counts = {
    critical: findings.filter((f) => f.severity === 'critical').length,
    high: findings.filter((f) => f.severity === 'high').length,
    medium: findings.filter((f) => f.severity === 'medium').length,
    low: findings.filter((f) => f.severity === 'low').length
  };

  // Store scan results
  const [inserted] = await db
    .insert(scanResults)
    .values({
      versionId: row.versionId,
      verdict: scanResult.verdict,
      totalFindings: findings.length,
      criticalCount: counts.critical,
      highCount: counts.high,
      mediumCount: counts.medium,
      lowCount: counts.low,
      stagesRun: scanResult.stage_results?.map((s) => s.stage) ?? [],
      durationMs: scanResult.duration_ms ?? 0,
      fileHashes: scanResult.file_hashes ?? {},
      llmAnalysis: scanResult.llm_analysis as typeof scanResults.$inferInsert.llmAnalysis
    })
    .returning({ id: scanResults.id });

  if (inserted && findings.length > 0) {
    await db.insert(scanFindings).values(
      findings.map((f) => ({
        scanId: inserted.id,
        stage: f.stage,
        severity: f.severity,
        type: f.type,
        description: f.description,
        location: f.location ?? null,
        confidence: f.confidence ?? null,
        tool: f.tool ?? null,
        evidence: f.evidence ?? null,
        llmVerdict: f.llm_verdict ?? null,
        llmReviewed: f.llm_reviewed ?? false
      }))
    );
  }

  // Audit log
  await db.insert(auditEvents).values({
    action: 'admin.package.rescan',
    actorId: adminUserId,
    targetType: 'skill',
    targetId: skillId,
    metadata: { name: row.skillName, version: row.version, versionId: row.versionId }
  });

  // Non-blocking: refresh dep audit data
  depAuditService.runAudit(row.versionId, row.manifest as Record<string, unknown>).catch(() => {});

  return {
    success: true,
    scanId: inserted.id,
    verdict: scanResult.verdict,
    findingsCount: findings.length,
    version: row.version
  };
}
