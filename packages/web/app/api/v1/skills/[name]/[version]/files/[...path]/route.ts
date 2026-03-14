import { LEGACY_MANIFEST_FILENAME, MANIFEST_FILENAME } from '@internals/schemas';
import { and, eq } from 'drizzle-orm';
import { unpackTar } from 'modern-tar';
import { NextResponse } from 'next/server';
import pako from 'pako';

import { canReadSkill, resolveRequestUserId } from '@/lib/auth-helpers';
import { db } from '@/lib/db';
import { skills, skillVersions } from '@/lib/db/schema';
import { getStorageProvider } from '@/lib/storage/provider';

function normalizeEntryName(name: string): string {
  return name.replace(/^package\//, '').replace(/^\.\//, '');
}

function getCandidatePaths(filePath: string): string[] {
  if (filePath === LEGACY_MANIFEST_FILENAME) {
    return [LEGACY_MANIFEST_FILENAME, MANIFEST_FILENAME];
  }

  if (filePath === MANIFEST_FILENAME) {
    return [MANIFEST_FILENAME, LEGACY_MANIFEST_FILENAME];
  }

  return [filePath];
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ name: string; version: string; path: string[] }> }
) {
  try {
    const { name: rawName, version, path: filePathParts } = await params;
    const name = decodeURIComponent(rawName);
    const filePath = filePathParts.join('/');
    const requesterUserId = await resolveRequestUserId(request);

    const skillVersionRows = await db
      .select({
        skillId: skills.id,
        versionId: skillVersions.id,
        tarballPath: skillVersions.tarballPath,
        visibility: skills.visibility,
        publisherId: skills.publisherId,
        orgId: skills.orgId
      })
      .from(skills)
      .innerJoin(skillVersions, and(eq(skillVersions.skillId, skills.id), eq(skillVersions.version, version)))
      .where(eq(skills.name, name))
      .limit(1);

    if (skillVersionRows.length === 0) {
      return NextResponse.json({ error: 'Skill or version not found' }, { status: 404 });
    }

    const { skillId, tarballPath, visibility, publisherId, orgId } = skillVersionRows[0];
    const normalizedVisibility = visibility === 'private' ? 'private' : 'public';

    const allowed = await canReadSkill(
      { skillId, visibility: normalizedVisibility, publisherId, orgId },
      requesterUserId
    );

    if (!allowed) {
      return NextResponse.json({ error: 'Skill or version not found' }, { status: 404 });
    }

    let signedDownloadUrl: string;
    try {
      const downloadData = await getStorageProvider().createSignedUrl(tarballPath, 3600, 'internal');
      signedDownloadUrl = downloadData.signedUrl;
    } catch (error) {
      console.error('[FileContent] Signed URL error:', error);
      return NextResponse.json({ error: 'Failed to generate download URL' }, { status: 500 });
    }

    const response = await fetch(signedDownloadUrl);
    if (!response.ok) {
      return NextResponse.json({ error: 'Failed to fetch tarball' }, { status: 500 });
    }

    // Get compressed tarball as ArrayBuffer
    const compressedBuffer = await response.arrayBuffer();

    // Decompress gzip using pako
    const decompressed = pako.ungzip(new Uint8Array(compressedBuffer));

    // Extract using modern-tar
    const candidatePaths = new Set(getCandidatePaths(filePath));
    const entries = await unpackTar(decompressed.buffer, {
      filter: (header) => candidatePaths.has(normalizeEntryName(header.name))
    });

    if (entries.length === 0) {
      return NextResponse.json({ error: 'File not found in package' }, { status: 404 });
    }

    const entry = entries.find((candidate) => normalizeEntryName(candidate.header.name) === filePath) ?? entries[0];
    const fileContent = new TextDecoder().decode(entry.data);

    const extension = filePath.split('.').pop()?.toLowerCase();
    const contentTypeMap: Record<string, string> = {
      md: 'text/markdown',
      json: 'application/json',
      txt: 'text/plain',
      js: 'application/javascript',
      ts: 'application/typescript',
      sh: 'text/x-shellscript',
      yml: 'text/yaml',
      yaml: 'text/yaml'
    };

    return new NextResponse(fileContent, {
      status: 200,
      headers: {
        'Content-Type': contentTypeMap[extension || ''] || 'text/plain',
        'Cache-Control': 'public, max-age=3600'
      }
    });
  } catch (error) {
    console.error('[FileContent] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
