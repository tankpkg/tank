import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { skillVersions, scanResults, scanFindings } from '@/lib/db/schema';
import { computeAuditScore, type AuditScoreInput } from '@/lib/audit-score';
import { getStorageProvider } from '@/lib/storage/provider';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ScanFinding {
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

export interface ScanResponse {
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
}

export interface RescanVersionInput {
  id: string;
  skillId: string;
  version: string;
  tarballPath: string;
  manifest: unknown;
  permissions: unknown;
  readme: string | null;
  fileCount: number;
  tarballSize: number;
}

export interface RescanResult {
  success: boolean;
  verdict?: string;
  error?: string;
}

// ---------------------------------------------------------------------------
// triggerSecurityScan — calls the Python scanner via HTTP
// ---------------------------------------------------------------------------

export async function triggerSecurityScan(
  tarballPath: string,
  versionId: string,
  manifest: Record<string, unknown>,
  permissions: Record<string, unknown>,
): Promise<ScanResponse | null> {
  try {
    let signedUrl: string;
    try {
      const urlData = await getStorageProvider().createSignedUrl(tarballPath, 3600);
      signedUrl = urlData.signedUrl;
    } catch (error) {
      console.error('Failed to generate signed URL for scan:', error);
      return null;
    }

    const pythonApiUrl = (process.env.PYTHON_API_URL || '').trim();
    const scanApiUrl = pythonApiUrl
      || process.env.NEXT_PUBLIC_APP_URL
      || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

    const scanResponse = await fetch(`${scanApiUrl}/api/analyze/scan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tarball_url: signedUrl,
        version_id: versionId,
        manifest,
        permissions,
      }),
    });

    if (!scanResponse.ok) {
      console.error('Scan endpoint returned error:', scanResponse.status);
      return null;
    }

    return await scanResponse.json() as ScanResponse;
  } catch (error) {
    console.error('Failed to trigger security scan:', error);
    return null;
  }
}

// ---------------------------------------------------------------------------
// rescanVersion — orchestrates a full rescan of one version
// ---------------------------------------------------------------------------

export async function rescanVersion(version: RescanVersionInput): Promise<RescanResult> {
  const manifest = version.manifest as AuditScoreInput['manifest'];
  const permissions = (version.permissions ?? {}) as Record<string, unknown>;

  try {
    const scanResult = await triggerSecurityScan(
      version.tarballPath,
      version.id,
      manifest,
      permissions,
    );

    if (scanResult) {
      const criticalHighFindings = scanResult.findings.filter(
        (f) => f.severity === 'critical' || f.severity === 'high',
      );

      const result = computeAuditScore({
        manifest,
        permissions,
        fileCount: version.fileCount,
        tarballSize: version.tarballSize,
        readme: version.readme,
        analysisResults: {
          securityIssues: criticalHighFindings,
          extractedPermissions: undefined,
        },
      });

      // Store scan results (only if Python API didn't already store them)
      // Python API returns scan_id when it successfully stored results
      if (!scanResult.scan_id) {
        try {
          const [scanResultRecord] = await db
            .insert(scanResults)
            .values({
              versionId: version.id,
              verdict: scanResult.verdict,
              totalFindings: scanResult.findings.length,
              criticalCount: scanResult.findings.filter(f => f.severity === 'critical').length,
              highCount: scanResult.findings.filter(f => f.severity === 'high').length,
              mediumCount: scanResult.findings.filter(f => f.severity === 'medium').length,
              lowCount: scanResult.findings.filter(f => f.severity === 'low').length,
              stagesRun: scanResult.stage_results?.map(s => s.stage) || [],
              durationMs: scanResult.duration_ms || null,
              fileHashes: scanResult.file_hashes || null,
            })
            .returning();

          if (scanResultRecord && scanResult.findings.length > 0) {
            await db.insert(scanFindings).values(
              scanResult.findings.map(f => ({
                scanId: scanResultRecord.id,
                stage: f.stage,
                severity: f.severity,
                type: f.type,
                description: f.description,
                location: f.location || null,
                confidence: f.confidence || null,
                tool: f.tool || null,
                evidence: f.evidence || null,
                llmVerdict: f.llm_verdict || null,
                llmReviewed: f.llm_reviewed || false,
              }))
            );
          }
        } catch (dbError) {
          console.error('Failed to store scan results:', dbError);
        }
      }

      // Map verdict to audit status
      const auditStatusMap: Record<string, string> = {
        pass: 'completed',
        pass_with_notes: 'completed',
        flagged: 'flagged',
        fail: 'failed',
      };

      await db
        .update(skillVersions)
        .set({
          auditScore: result.score,
          auditStatus: auditStatusMap[scanResult.verdict] ?? 'completed',
        })
        .where(eq(skillVersions.id, version.id));

      return { success: true, verdict: scanResult.verdict };
    } else {
      // Scan failed — use default scoring
      const result = computeAuditScore({
        manifest,
        permissions,
        fileCount: version.fileCount,
        tarballSize: version.tarballSize,
        readme: version.readme,
        analysisResults: null,
      });

      await db
        .update(skillVersions)
        .set({
          auditScore: result.score,
          auditStatus: 'scan-failed',
        })
        .where(eq(skillVersions.id, version.id));

      return { success: false, error: 'Scan failed' };
    }
  } catch (error) {
    console.error('Rescan error for version', version.id, error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}
