import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { verifyCliAuth } from '@/lib/auth-helpers';
import { db } from '@/lib/db';
import { skills, skillVersions, scanResults, scanFindings } from '@/lib/db/schema';
import { computeAuditScore, type AuditScoreInput } from '@/lib/audit-score';
import { supabaseAdmin } from '@/lib/supabase';

// Types for Python scan endpoint response
interface ScanFinding {
  stage: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  type: string;
  description: string;
  location: string | null;
  confidence: number | null;
  tool: string | null;
  evidence: string | null;
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
}

// Call Python scan endpoint
async function triggerSecurityScan(
  tarballPath: string,
  versionId: string,
  manifest: Record<string, unknown>,
  permissions: Record<string, unknown>,
): Promise<ScanResponse | null> {
  try {
    // Generate signed download URL
    const { data: urlData, error: urlError } = await supabaseAdmin.storage
      .from('packages')
      .createSignedUrl(tarballPath, 3600);

    if (urlError || !urlData) {
      console.error('Failed to generate signed URL for scan:', urlError);
      return null;
    }

    // Call Python scan endpoint (use separate Python API URL if configured)
    // Trim to handle any accidental whitespace/newlines in env vars
    const pythonApiUrl = (process.env.PYTHON_API_URL || '').trim();
    const scanApiUrl = pythonApiUrl
      || process.env.NEXT_PUBLIC_APP_URL
      || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

    console.log('[Scan] Calling Python API:', scanApiUrl);

    const scanResponse = await fetch(`${scanApiUrl}/api/analyze/scan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tarball_url: urlData.signedUrl,
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

export async function POST(request: Request) {
  // 1. Verify CLI auth
  const verified = await verifyCliAuth(request);
  if (!verified) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 2. Parse body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { versionId, integrity, fileCount, tarballSize, readme } = body as {
    versionId?: string;
    integrity?: string;
    fileCount?: number;
    tarballSize?: number;
    readme?: string;
  };

  if (!versionId || !integrity) {
    return NextResponse.json(
      { error: 'Missing required fields: versionId, integrity' },
      { status: 400 },
    );
  }

  // 3. Look up version record
  const existingVersions = await db
    .select()
    .from(skillVersions)
    .where(eq(skillVersions.id, versionId))
    .limit(1);

  if (existingVersions.length === 0) {
    return NextResponse.json(
      { error: 'Skill version not found' },
      { status: 404 },
    );
  }

  const version = existingVersions[0];

  // 4. Verify version is in pending-upload status
  if (version.auditStatus !== 'pending-upload') {
    return NextResponse.json(
      { error: 'Version is already confirmed or published' },
      { status: 400 },
    );
  }

  // 5. Look up skill name for response
  const existingSkills = await db
    .select()
    .from(skills)
    .where(eq(skills.id, version.skillId))
    .limit(1);

  const skill = existingSkills[0];

  // 6. Update version record with initial data
  let auditScore: number | null = null;
  const manifest = version.manifest as AuditScoreInput['manifest'];
  const permissions = (version.permissions ?? {}) as Record<string, unknown>;

  // Initial update with integrity and file info
  await db
    .update(skillVersions)
    .set({
      integrity,
      fileCount: fileCount ?? 0,
      tarballSize: tarballSize ?? 0,
      auditStatus: 'scanning', // Mark as scanning in progress
      ...(typeof readme === 'string' ? { readme } : {}),
    })
    .where(eq(skillVersions.id, versionId));

  // 7. Trigger security scan (fire-and-await)
  let scanVerdict: string | null = null;
  try {
    const scanResult = await triggerSecurityScan(
      version.tarballPath,
      versionId,
      manifest,
      permissions,
    );

    if (scanResult) {
      scanVerdict = scanResult.verdict;

      // Compute audit score with real scan data
      const criticalHighFindings = scanResult.findings.filter(
        (f) => f.severity === 'critical' || f.severity === 'high',
      );

      const result = computeAuditScore({
        manifest,
        permissions,
        fileCount: fileCount ?? 0,
        tarballSize: tarballSize ?? 0,
        readme: typeof readme === 'string' ? readme : (version.readme ?? null),
        analysisResults: {
          securityIssues: criticalHighFindings,
          extractedPermissions: undefined,
        },
      });

      auditScore = result.score;

      // Store scan results in database for UI display
      try {
        const [scanResultRecord] = await db
          .insert(scanResults)
          .values({
            versionId: versionId,
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

        // Store individual findings
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
            }))
          );
        }
      } catch (dbError) {
        console.error('Failed to store scan results:', dbError);
        // Continue - don't fail the whole publish if storage fails
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
        .where(eq(skillVersions.id, versionId));
    } else {
      // Scan failed - use default scoring, graceful degradation
      const result = computeAuditScore({
        manifest,
        permissions,
        fileCount: fileCount ?? 0,
        tarballSize: tarballSize ?? 0,
        readme: typeof readme === 'string' ? readme : (version.readme ?? null),
        analysisResults: null,
      });

      auditScore = result.score;

      await db
        .update(skillVersions)
        .set({
          auditScore: result.score,
          auditStatus: 'scan-failed',
        })
        .where(eq(skillVersions.id, versionId));
    }
  } catch (error) {
    // Scan threw an error - graceful degradation
    console.error('Security scan error:', error);

    const result = computeAuditScore({
      manifest,
      permissions,
      fileCount: fileCount ?? 0,
      tarballSize: tarballSize ?? 0,
      readme: typeof readme === 'string' ? readme : (version.readme ?? null),
      analysisResults: null,
    });

    auditScore = result.score;

    await db
      .update(skillVersions)
      .set({
        auditScore: result.score,
        auditStatus: 'scan-failed',
      })
      .where(eq(skillVersions.id, versionId));
  }

  // 8. Return success
  return NextResponse.json({
    success: true,
    name: skill?.name ?? 'unknown',
    version: version.version,
    auditScore,
    scanVerdict,
  });
}
