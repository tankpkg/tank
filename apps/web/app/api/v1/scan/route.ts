import { NextResponse } from 'next/server';
import { verifyCliAuth } from '@/lib/auth-helpers';
import { getStorageProvider } from '@/lib/storage/provider';
import crypto from 'node:crypto';

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
  llm_verdict?: string | null;         // LLM classification for "likely_benign", "confirmed_threat", "uncertain"
  llm_reviewed?: boolean;     // Whether LLM analyzed this finding
}

interface LLMAnalysis {
  enabled: boolean;
  mode: string;          // "byollm", "builtin", "disabled"
  providers: Array<{
    name: string;
    model: string;
    api_key_configured: boolean;
    base_url: string;
    status: string;
    latency_ms: number | null;
    error: string | null;
  }>;
}

interface ScanResponse {
  scan_id: string | null;
  verdict: 'pass' | 'pass_with_notes' | 'flagged' | 'fail';
  audit_score: number;
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

// Call Python scan endpoint
async function triggerSecurityScan(
  tarballBuffer: Buffer,
  manifest: Record<string, unknown>,
): Promise<ScanResponse> {
  // Generate a unique temp path
  const scanId = crypto.randomUUID();
  const tempPath = `scans/temp/${scanId}.tgz`;

  // Upload tarball to temp storage
  const storage = getStorageProvider();
  const { signedUrl: uploadUrl } = await storage.createSignedUploadUrl(tempPath);

  // Upload the tarball (convert Buffer to Uint8Array for fetch compatibility)
  const uploadRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/gzip',
    },
    body: new Uint8Array(tarballBuffer),
  });

  if (!uploadRes.ok) {
    throw new Error(`Failed to upload tarball for scanning: ${uploadRes.statusText}`);
  }

  // Generate signed download URL for scanner
  const { signedUrl: downloadUrl } = await storage.createSignedUrl(tempPath, 600);

  // Call Python scan endpoint
  const pythonApiUrl = (process.env.PYTHON_API_URL || '').trim();
  const scanApiUrl = pythonApiUrl
    || process.env.NEXT_PUBLIC_APP_URL
    || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

  const scanResponse = await fetch(`${scanApiUrl}/api/analyze/scan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tarball_url: downloadUrl,
      version_id: scanId,
      manifest,
      permissions: (manifest.permissions as Record<string, unknown>) ?? {},
    }),
  });

  if (!scanResponse.ok) {
    const errorBody = await scanResponse.json().catch(() => ({}));
    throw new Error(`Scan failed: ${(errorBody as { error?: string }).error ?? scanResponse.statusText}`);
  }

  const result = await scanResponse.json() as ScanResponse;

  // Clean up temp file (best effort)
  // Note: Supabase storage doesn't have a simple delete via signed URL
  // We rely on bucket lifecycle policies to clean up temp/ prefix

  return result;
}

export async function POST(request: Request) {
  // 1. Verify CLI auth
  const verified = await verifyCliAuth(request);
  if (!verified) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 2. Parse multipart/form-data
  const formData = await request.formData();
  const tarball = formData.get('tarball');
  const manifestStr = formData.get('manifest');

  if (!tarball || !(tarball instanceof Blob)) {
    return NextResponse.json({ error: 'Missing tarball file' }, { status: 400 });
  }

  let manifest: Record<string, unknown>;
  if (manifestStr && typeof manifestStr === 'string') {
    try {
      manifest = JSON.parse(manifestStr);
    } catch {
      return NextResponse.json({ error: 'Invalid manifest JSON' }, { status: 400 });
    }
  } else {
    manifest = {};
  }

  // 3. Convert Blob to Buffer
  const arrayBuffer = await tarball.arrayBuffer();
  const tarballBuffer = Buffer.from(arrayBuffer);

  // 4. Enforce size limit (50MB)
  const MAX_SIZE = 50 * 1024 * 1024;
  if (tarballBuffer.length > MAX_SIZE) {
    return NextResponse.json(
      { error: `Tarball too large: ${tarballBuffer.length} bytes exceeds ${MAX_SIZE} bytes` },
      { status: 400 },
    );
  }

  // 5. Trigger scan
  try {
    const scanResult = await triggerSecurityScan(tarballBuffer, manifest);

    // 6. Return scan results
    console.log('[Scan] LLM analysis:', scanResult.llm_analysis);
    return NextResponse.json({
      scan_id: scanResult.scan_id,
      verdict: scanResult.verdict,
      audit_score: scanResult.audit_score,
      findings: scanResult.findings,
      stage_results: scanResult.stage_results,
      duration_ms: scanResult.duration_ms,
      file_hashes: scanResult.file_hashes,
      llm_analysis: scanResult.llm_analysis,
    });
  } catch (error) {
    console.error('Scan error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Scan failed' },
      { status: 500 },
    );
  }
}
