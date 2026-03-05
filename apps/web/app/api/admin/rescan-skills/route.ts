import { NextRequest, NextResponse } from 'next/server';
import { inArray } from 'drizzle-orm';
import { withAdminAuth, type AdminAuthContext } from '@/lib/admin-middleware';
import { db } from '@/lib/db';
import { skillVersions } from '@/lib/db/schema';
import { rescanVersion } from '@/lib/rescan';

// Statuses that indicate a version has been scanned and can be rescanned
const RESCANNABLE_STATUSES = ['completed', 'flagged', 'scan-failed'] as const;

const handler = async (_req: NextRequest, _context: AdminAuthContext): Promise<NextResponse> => {
  try {
    // Get all published skill versions with rescannable statuses
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
      })
      .from(skillVersions)
      .where(inArray(skillVersions.auditStatus, [...RESCANNABLE_STATUSES]));

    if (versions.length === 0) {
      return NextResponse.json({
        message: 'No published versions to rescan',
        scanned: 0,
      });
    }

    // Rescan all versions (in series to avoid overwhelming the scan service)
    const results = {
      total: versions.length,
      success: 0,
      failed: 0,
      errors: [] as Array<{ versionId: string; error: string }>,
    };

    for (const version of versions) {
      const result = await rescanVersion(version);
      if (result.success) {
        results.success++;
      } else {
        results.failed++;
        results.errors.push({
          versionId: version.id,
          error: result.error || 'Unknown error',
        });
      }
    }

    return NextResponse.json({
      message: `Rescanned ${results.total} skill versions`,
      ...results,
    });
  } catch (error) {
    console.error('Rescan all skills error:', error);
    return NextResponse.json(
      { error: 'Failed to rescan skills' },
      { status: 500 }
    );
  }
};

export const POST = withAdminAuth(handler);

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}
