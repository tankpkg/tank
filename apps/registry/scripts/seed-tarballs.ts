#!/usr/bin/env bun
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { gzipSync } from 'node:zlib';
import { CreateBucketCommand, HeadBucketCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import postgres from 'postgres';
import { pack } from 'tar-stream';

const SKILLS_DIR = '/tmp/tank-skills/skills';

function collectFiles(dir: string, base: string): { path: string; content: Buffer }[] {
  const files: { path: string; content: Buffer }[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...collectFiles(full, base));
    else files.push({ path: relative(base, full), content: readFileSync(full) });
  }
  return files;
}

function createTarball(files: { path: string; content: Buffer }[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const p = pack();
    const chunks: Buffer[] = [];

    p.on('data', (chunk: Buffer) => chunks.push(chunk));
    p.on('end', () => resolve(Buffer.concat(chunks)));
    p.on('error', reject);

    for (const file of files) {
      p.entry({ name: `package/${file.path}` }, file.content);
    }
    p.finalize();
  });
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL required');
    process.exit(1);
  }

  const sql = postgres(databaseUrl);
  const s3 = new S3Client({
    region: process.env.S3_REGION || 'us-east-1',
    endpoint: process.env.S3_ENDPOINT || 'http://localhost:9000',
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY || 'minioadmin',
      secretAccessKey: process.env.S3_SECRET_KEY || 'minioadmin'
    }
  });

  const bucket = process.env.S3_BUCKET || 'tank-skills';

  try {
    await s3.send(new HeadBucketCommand({ Bucket: bucket }));
  } catch {
    await s3.send(new CreateBucketCommand({ Bucket: bucket }));
    console.log(`Created bucket: ${bucket}`);
  }

  const skillDirs = readdirSync(SKILLS_DIR).filter((name) => {
    try {
      return statSync(join(SKILLS_DIR, name)).isDirectory() && statSync(join(SKILLS_DIR, name, 'skills.json')).isFile();
    } catch {
      return false;
    }
  });

  console.log(`Uploading tarballs for ${skillDirs.length} skills...`);

  for (const dirName of skillDirs) {
    const skillDir = join(SKILLS_DIR, dirName);
    const manifest = JSON.parse(readFileSync(join(skillDir, 'skills.json'), 'utf-8'));
    const name: string = manifest.name;

    const rows = await sql`
      SELECT sv.tarball_path FROM skill_versions sv
      INNER JOIN skills s ON s.id = sv.skill_id
      WHERE s.name = ${name}
    `;

    if (rows.length === 0) {
      console.log(`  ⚠ ${name}: no version in DB, skipping`);
      continue;
    }

    const tarballPath = rows[0].tarball_path as string;
    const files = collectFiles(skillDir, skillDir);
    const tarData = await createTarball(files);
    const gzipped = gzipSync(tarData);

    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: tarballPath,
        Body: gzipped,
        ContentType: 'application/gzip'
      })
    );

    console.log(`  ✓ ${name} → ${tarballPath} (${(gzipped.length / 1024).toFixed(1)} KB)`);
  }

  console.log(`\n✅ All tarballs uploaded to ${bucket}`);
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
