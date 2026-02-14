/**
 * One-off backfill script: Downloads each skill's tarball from Supabase Storage,
 * extracts the SKILL.md content and file list, then updates the skill_versions table.
 *
 * Usage: node scripts/backfill-readme.mjs
 *
 * Requires: .env.local with DATABASE_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
import { readFileSync } from 'node:fs';

// Manual .env.local loader (no dotenv dependency)
function loadEnv(filePath) {
  const content = readFileSync(filePath, 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    // Remove surrounding quotes
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    process.env[key] = val; // Force override (shell env may conflict)
  }
}
loadEnv('.env.local');

import { createClient } from '@supabase/supabase-js';
import postgres from 'postgres';
import { execSync } from 'node:child_process';
import { writeFileSync, mkdirSync, rmSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const sql = postgres(process.env.DATABASE_URL);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

/** Recursively list all files in a directory (relative paths) */
function listFiles(dir, base = '') {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      files.push(...listFiles(join(dir, entry.name), rel));
    } else {
      files.push(rel);
    }
  }
  return files;
}

async function main() {
  console.log('🔄 Backfilling readme and files for existing skill versions...\n');

  // Get all skill versions with their skill names
  const versions = await sql`
    SELECT sv.id, sv.tarball_path, sv.readme, sv.version, s.name as skill_name
    FROM skill_versions sv
    JOIN skills s ON s.id = sv.skill_id
    ORDER BY s.name
  `;

  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const sv of versions) {
    if (sv.readme !== null) {
      console.log(`  ⏭  ${sv.skill_name}@${sv.version} — already has readme, skipping`);
      skipped++;
      continue;
    }

    try {
      // Download tarball from Supabase storage
      const { data, error } = await supabase.storage.from('packages').download(sv.tarball_path);

      if (error || !data) {
        console.error(`  ❌ ${sv.skill_name}@${sv.version} — download failed: ${error?.message}`);
        failed++;
        continue;
      }

      // Write tarball to temp file and extract
      const tmpDir = join(tmpdir(), `tank-backfill-${Date.now()}`);
      const tarballPath = join(tmpDir, 'package.tgz');
      const extractDir = join(tmpDir, 'extracted');
      mkdirSync(extractDir, { recursive: true });

      const buffer = Buffer.from(await data.arrayBuffer());
      writeFileSync(tarballPath, buffer);

      // Extract using system tar
      execSync(`tar xzf "${tarballPath}" -C "${extractDir}"`, { stdio: 'pipe' });

      // Find all files and look for SKILL.md
      const files = listFiles(extractDir);
      let readme = null;

      // Look for SKILL.md (might be at root or inside a package/ folder)
      for (const f of files) {
        const basename = f.split('/').pop();
        if (basename === 'SKILL.md') {
          readme = readFileSync(join(extractDir, f), 'utf-8');
          break;
        }
      }

      // Normalize file paths (remove leading package/ if present)
      const normalizedFiles = files.map(f => {
        if (f.startsWith('package/')) return f.slice(8);
        return f;
      });

      // Update the skill_versions record
      await sql`
        UPDATE skill_versions
        SET readme = ${readme}, file_count = ${normalizedFiles.length}
        WHERE id = ${sv.id}
      `;

      console.log(
        `  ✅ ${sv.skill_name}@${sv.version} — ${readme ? `readme: ${readme.length} chars` : 'no SKILL.md'}, ${normalizedFiles.length} files`,
      );
      updated++;

      // Cleanup temp dir
      rmSync(tmpDir, { recursive: true, force: true });
    } catch (err) {
      console.error(`  ❌ ${sv.skill_name}@${sv.version} — error: ${err.message}`);
      failed++;
    }
  }

  console.log(`\n📊 Done: ${updated} updated, ${skipped} skipped, ${failed} failed`);
  await sql.end();
  process.exit(0);
}

main().catch(async (err) => {
  console.error('Fatal error:', err);
  await sql.end();
  process.exit(1);
});
