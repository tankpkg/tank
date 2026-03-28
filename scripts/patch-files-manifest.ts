#!/usr/bin/env bun
/**
 * Patch skill_versions.manifest to include the `files` array from the
 * cloned skills repo. This makes the Files tab work on the skill detail page.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import postgres from 'postgres';

const SKILLS_DIR = '/tmp/tank-skills/skills';

function listFiles(dir: string, base: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...listFiles(full, base));
    else files.push(relative(base, full));
  }
  return files.sort();
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }

  const sql = postgres(databaseUrl);

  const skillDirs = readdirSync(SKILLS_DIR).filter((name) => {
    try {
      return statSync(join(SKILLS_DIR, name)).isDirectory() && statSync(join(SKILLS_DIR, name, 'skills.json')).isFile();
    } catch {
      return false;
    }
  });

  console.log(`Patching ${skillDirs.length} skills with file lists...`);

  for (const dirName of skillDirs) {
    const skillDir = join(SKILLS_DIR, dirName);
    const manifest = JSON.parse(readFileSync(join(skillDir, 'skills.json'), 'utf-8'));
    const name: string = manifest.name;
    const files = listFiles(skillDir, skillDir);

    await sql`
      UPDATE skill_versions SET manifest = manifest || ${sql.json({ files })}::jsonb
      WHERE skill_id IN (SELECT id FROM skills WHERE name = ${name})
    `;
    console.log(`  ✓ ${name}: ${files.length} files`);
  }

  console.log(`\n✅ Patched all manifests with file lists`);
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
