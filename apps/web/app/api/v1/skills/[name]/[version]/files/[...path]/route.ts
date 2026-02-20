import { NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { unpackTar } from 'modern-tar';
import pako from 'pako';
import { db } from '@/lib/db';
import { skills, skillVersions } from '@/lib/db/schema';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ name: string; version: string; path: string[] }> },
) {
  try {
    const { name: rawName, version, path: filePathParts } = await params;
    const name = decodeURIComponent(rawName);
    const filePath = filePathParts.join('/');

    const skillVersionRows = await db
      .select({
        skillId: skills.id,
        versionId: skillVersions.id,
        tarballPath: skillVersions.tarballPath,
      })
      .from(skills)
      .innerJoin(skillVersions, and(
        eq(skillVersions.skillId, skills.id),
        eq(skillVersions.version, version),
      ))
      .where(eq(skills.name, name))
      .limit(1);

    if (skillVersionRows.length === 0) {
      return NextResponse.json({ error: 'Skill or version not found' }, { status: 404 });
    }

    const { tarballPath } = skillVersionRows[0];

    const { data: downloadData, error: downloadError } = await supabaseAdmin.storage
      .from('packages')
      .createSignedUrl(tarballPath, 3600);

    if (downloadError || !downloadData) {
      console.error('[FileContent] Supabase signed URL error:', downloadError);
      return NextResponse.json(
        { error: 'Failed to generate download URL', details: downloadError?.message },
        { status: 500 },
      );
    }

    const response = await fetch(downloadData.signedUrl);
    if (!response.ok) {
      return NextResponse.json({ error: 'Failed to fetch tarball' }, { status: 500 });
    }

    // Get compressed tarball as ArrayBuffer
    const compressedBuffer = await response.arrayBuffer();

    // Decompress gzip using pako
    const decompressed = pako.ungzip(new Uint8Array(compressedBuffer));

    // Extract using modern-tar
    const entries = await unpackTar(decompressed.buffer, {
      filter: (header) => header.name.replace(/^package\//, '') === filePath,
    });

    if (entries.length === 0) {
      return NextResponse.json({ error: 'File not found in package' }, { status: 404 });
    }

    const entry = entries[0];
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
      yaml: 'text/yaml',
    };

    return new NextResponse(fileContent, {
      status: 200,
      headers: {
        'Content-Type': contentTypeMap[extension || ''] || 'text/plain',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (error) {
    console.error('[FileContent] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
