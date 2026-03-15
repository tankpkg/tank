import { desc, inArray } from 'drizzle-orm';
import { type NextRequest, NextResponse } from 'next/server';
import { type AdminAuthContext, withAdminAuth } from '@/lib/admin-middleware';
import { db } from '@/lib/db';
import { skillVersions } from '@/lib/db/schema';
import { rescanVersion } from '@/lib/rescan';

// Statuses that indicate a version has been scanned and can be rescanned
const RESCANNABLE_STATUSES = ['completed', 'flagged', 'scan-failed'] as const;

// Process in batches to avoid connection pool exhaustion
const BATCH_SIZE = 3;
const BATCH_DELAY_MS = 3000;
const SCAN_DELAY_MS = 1000;

export const dynamic = 'force-dynamic';

// In-memory job tracking (resets on server restart, but fine for this use case)
const jobs = new Map<
  string,
  {
    status: 'running' | 'completed' | 'failed';
    total: number;
    processed: number;
    success: number;
    failed: number;
    errors: Array<{ versionId: string; error: string }>;
    startedAt: Date;
    completedAt?: Date;
  }
>();

async function processRescanJob(
  jobId: string,
  versionsToScan: Array<{
    id: string;
    skillId: string;
    version: string;
    tarballPath: string;
    manifest: unknown;
    permissions: unknown;
    readme: string | null;
    fileCount: number;
    tarballSize: number;
    auditScore: number | null;
  }>
) {
  const job = jobs.get(jobId);
  if (!job) return;

  for (let i = 0; i < versionsToScan.length; i++) {
    // Check if job was cancelled (status changed externally)
    if (job.status !== 'running') break;

    const version = versionsToScan[i];
    try {
      const result = await rescanVersion(version);
      if (result.success) {
        job.success++;
      } else {
        job.failed++;
        job.errors.push({
          versionId: version.id,
          error: result.error || 'Unknown error'
        });
      }
    } catch (error) {
      job.failed++;
      job.errors.push({
        versionId: version.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }

    job.processed = i + 1;

    // Add delay between individual scans
    if (i < versionsToScan.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, SCAN_DELAY_MS));
    }

    // Add longer pause after each batch
    if ((i + 1) % BATCH_SIZE === 0 && i < versionsToScan.length - 1) {
      console.log(`[Rescan ${jobId}] Completed batch of ${BATCH_SIZE}, pausing...`);
      await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY_MS));
    }
  }

  job.status = 'completed';
  job.completedAt = new Date();
  console.log(`[Rescan ${jobId}] Job completed: ${job.success} success, ${job.failed} failed`);
}

async function handler(req: NextRequest, _context: AdminAuthContext): Promise<NextResponse> {
  // Check if this is a status check request
  const url = new URL(req.url);
  const jobId = url.searchParams.get('jobId');

  if (jobId) {
    // Return job status
    const job = jobs.get(jobId);
    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }
    return NextResponse.json(job);
  }

  try {
    // Get only the latest version of each skill
    const versions = await db
      .select({
        id: skillVersions.id,
        skillId: skillVersions.skillId,
        version: skillVersions.version,
        tarballPath: skillVersions.tarballPath,
        manifest: skillVersions.manifest,
        permissions: skillVersions.permissions,
        readme: skillVersions.readme,
        fileCount: skillVersions.fileCount,
        tarballSize: skillVersions.tarballSize,
        auditScore: skillVersions.auditScore
      })
      .from(skillVersions)
      .where(inArray(skillVersions.auditStatus, [...RESCANNABLE_STATUSES]))
      .orderBy(skillVersions.skillId, desc(skillVersions.createdAt))
      .limit(1000);

    // Filter to keep only the latest version per skill
    const latestVersions = new Map<string, (typeof versions)[0]>();
    for (const v of versions) {
      if (!latestVersions.has(v.skillId)) {
        latestVersions.set(v.skillId, v);
      }
    }
    const versionsToScan = Array.from(latestVersions.values()).map((v) => ({
      ...v,
      fileCount: v.fileCount ?? 0,
      tarballSize: v.tarballSize ?? 0
    }));

    if (versionsToScan.length === 0) {
      return NextResponse.json({
        message: 'No published versions to rescan',
        jobId: null,
        total: 0
      });
    }

    // Create a new job
    const newJobId = `rescan-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    jobs.set(newJobId, {
      status: 'running',
      total: versionsToScan.length,
      processed: 0,
      success: 0,
      failed: 0,
      errors: [],
      startedAt: new Date()
    });

    // Start processing in background (don't await)
    processRescanJob(newJobId, versionsToScan).catch((error) => {
      console.error(`[Rescan ${newJobId}] Job failed:`, error);
      const job = jobs.get(newJobId);
      if (job) {
        job.status = 'failed';
        job.completedAt = new Date();
      }
    });

    // Return immediately with job ID
    return NextResponse.json({
      message: `Rescan job started for ${versionsToScan.length} skill versions`,
      jobId: newJobId,
      total: versionsToScan.length,
      statusUrl: `/api/admin/rescan-skills?jobId=${newJobId}`
    });
  } catch (error) {
    console.error('Rescan all skills error:', error);
    return NextResponse.json({ error: 'Failed to start rescan job' }, { status: 500 });
  }
}

export const POST = withAdminAuth(handler);

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    }
  });
}
