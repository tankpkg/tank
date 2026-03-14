import { zValidator } from '@hono/zod-validator';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';

import { type AuditScoreInput, computeAuditScore } from '~/lib/audit-score';
import { verifyCliAuth } from '~/lib/auth-helpers';
import { db } from '~/lib/db';
import { scanFindings, scanResults, skills, skillVersions } from '~/lib/db/schema';
import { getStorageProvider } from '~/lib/storage/provider';

interface ScanFinding {
  stage: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  type: string;
  description: string;
  location: string | null;
  confidence: number | null;
  tool: string | null;
  evidence: string | null;
  llm_verdict?: string | null;
  llm_reviewed?: boolean;
}

interface LLMAnalysis {
  enabled: boolean;
  mode: string;
  provider_used?: string;
  findings_reviewed?: number;
  findings_dismissed?: number;
  findings_confirmed?: number;
  findings_uncertain?: number;
  latency_ms?: number | null;
  cache_hit?: boolean;
  error?: string | null;
  reason?: string | null;
}

interface ScanResponse {
  scan_id: string | null;
  verdict: 'pass' | 'pass_with_notes' | 'flagged' | 'fail';
  findings: ScanFinding[];
  stage_results: Array<{
    stage: string;
    status: string;
    findings: ScanFinding[];
    duration_ms: number;
  }>;
  duration_ms: number;
  file_hashes: Record<string, string>;
  llm_analysis?: LLMAnalysis | null;
}

async function triggerSecurityScan(
  tarballPath: string,
  versionId: string,
  manifest: Record<string, unknown>,
  permissions: Record<string, unknown>
): Promise<ScanResponse | null> {
  try {
    let signedUrl: string;
    try {
      const urlData = await getStorageProvider().createSignedUrl(tarballPath, 3600, 'internal');
      signedUrl = urlData.signedUrl;
    } catch {
      return null;
    }

    const pythonApiUrl = (process.env.PYTHON_API_URL || '').trim();
    const scanApiUrl = pythonApiUrl || process.env.APP_URL || process.env.BETTER_AUTH_URL || 'http://localhost:3001';

    const scanResponse = await fetch(`${scanApiUrl}/api/analyze/scan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tarball_url: signedUrl,
        version_id: versionId,
        manifest,
        permissions
      })
    });

    if (!scanResponse.ok) {
      return null;
    }

    return (await scanResponse.json()) as ScanResponse;
  } catch {
    return null;
  }
}

const confirmSchema = z.object({
  versionId: z.string().uuid(),
  integrity: z
    .string()
    .regex(/^sha512-/, 'Must be a sha512 integrity hash')
    .max(256),
  fileCount: z.number().int().min(0).max(10_000).optional(),
  tarballSize: z
    .number()
    .int()
    .min(0)
    .max(100 * 1024 * 1024)
    .optional(),
  readme: z.string().max(500_000).optional()
});

export const skillsConfirmRoutes = new Hono().post('/confirm', zValidator('json', confirmSchema), async (c) => {
  const verified = await verifyCliAuth(c.req.raw);
  if (!verified) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const { versionId, integrity, fileCount, tarballSize, readme } = c.req.valid('json');

  const existingVersions = await db.select().from(skillVersions).where(eq(skillVersions.id, versionId)).limit(1);

  if (existingVersions.length === 0) {
    return c.json({ error: 'Skill version not found' }, 404);
  }

  const version = existingVersions[0];

  if (version.publishedBy !== verified.userId) {
    return c.json({ error: 'Skill version not found' }, 404);
  }

  if (version.auditStatus !== 'pending-upload') {
    return c.json({ error: 'Version is already confirmed or published' }, 400);
  }

  const existingSkills = await db.select().from(skills).where(eq(skills.id, version.skillId)).limit(1);
  const skill = existingSkills[0];

  let auditScore: number | null = null;
  const manifest = version.manifest as AuditScoreInput['manifest'];
  const permissions = (version.permissions ?? {}) as Record<string, unknown>;

  await db
    .update(skillVersions)
    .set({
      integrity,
      fileCount: fileCount ?? 0,
      tarballSize: tarballSize ?? 0,
      auditStatus: 'scanning',
      ...(typeof readme === 'string' ? { readme } : {})
    })
    .where(eq(skillVersions.id, versionId));

  let scanVerdict: string | null = null;
  try {
    const scanResult = await triggerSecurityScan(version.tarballPath, versionId, manifest, permissions);

    if (scanResult) {
      scanVerdict = scanResult.verdict;

      const criticalHighFindings = scanResult.findings.filter(
        (f) => f.severity === 'critical' || f.severity === 'high'
      );

      const result = computeAuditScore({
        manifest,
        permissions,
        fileCount: fileCount ?? 0,
        tarballSize: tarballSize ?? 0,
        readme: typeof readme === 'string' ? readme : (version.readme ?? null),
        analysisResults: {
          securityIssues: criticalHighFindings,
          extractedPermissions: undefined
        }
      });

      auditScore = result.score;

      try {
        const [scanResultRecord] = await db
          .insert(scanResults)
          .values({
            versionId: versionId,
            verdict: scanResult.verdict,
            totalFindings: scanResult.findings.length,
            criticalCount: scanResult.findings.filter((f) => f.severity === 'critical').length,
            highCount: scanResult.findings.filter((f) => f.severity === 'high').length,
            mediumCount: scanResult.findings.filter((f) => f.severity === 'medium').length,
            lowCount: scanResult.findings.filter((f) => f.severity === 'low').length,
            stagesRun: scanResult.stage_results?.map((s) => s.stage) || [],
            durationMs: scanResult.duration_ms || null,
            fileHashes: scanResult.file_hashes || null,
            llmAnalysis: scanResult.llm_analysis as {
              enabled: boolean;
              mode: string;
              providers?: Array<{ name: string; model: string; status: string; latency_ms: number | null }>;
              findings_reviewed?: number;
              findings_dismissed?: number;
              findings_confirmed?: number;
              findings_uncertain?: number;
              provider_used?: string;
              latency_ms?: number;
              error?: string;
            } | null
          })
          .returning();

        if (scanResultRecord && scanResult.findings.length > 0) {
          await db.insert(scanFindings).values(
            scanResult.findings.map((f) => ({
              scanId: scanResultRecord.id,
              stage: f.stage,
              severity: f.severity,
              type: f.type,
              description: f.description,
              location: f.location || null,
              confidence: f.confidence || null,
              tool: f.tool || null,
              evidence: f.evidence || null,
              llmVerdict: (f as { llm_verdict?: string }).llm_verdict || null,
              llmReviewed: (f as { llm_reviewed?: boolean }).llm_reviewed || false
            }))
          );
        }
      } catch {
        // Don't fail the whole publish if scan storage fails
      }

      const auditStatusMap: Record<string, string> = {
        pass: 'completed',
        pass_with_notes: 'completed',
        flagged: 'flagged',
        fail: 'failed'
      };

      await db
        .update(skillVersions)
        .set({
          auditScore: result.score,
          auditStatus: auditStatusMap[scanResult.verdict] ?? 'completed'
        })
        .where(eq(skillVersions.id, versionId));
    } else {
      const result = computeAuditScore({
        manifest,
        permissions,
        fileCount: fileCount ?? 0,
        tarballSize: tarballSize ?? 0,
        readme: typeof readme === 'string' ? readme : (version.readme ?? null),
        analysisResults: null
      });

      auditScore = result.score;

      await db
        .update(skillVersions)
        .set({
          auditScore: result.score,
          auditStatus: 'scan-failed'
        })
        .where(eq(skillVersions.id, versionId));
    }
  } catch {
    const result = computeAuditScore({
      manifest,
      permissions,
      fileCount: fileCount ?? 0,
      tarballSize: tarballSize ?? 0,
      readme: typeof readme === 'string' ? readme : (version.readme ?? null),
      analysisResults: null
    });

    auditScore = result.score;

    await db
      .update(skillVersions)
      .set({
        auditScore: result.score,
        auditStatus: 'scan-failed'
      })
      .where(eq(skillVersions.id, versionId));
  }

  return c.json({
    success: true,
    name: skill?.name ?? 'unknown',
    version: version.version,
    auditScore,
    scanVerdict
  });
});
