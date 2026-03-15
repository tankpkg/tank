#!/usr/bin/env bun
/**
 * Seed script for Docker-based visual parity testing.
 * Reads all 53 skills from /tmp/tank-skills/ (cloned from github.com/tankpkg/skills)
 * and inserts them into the local postgres database.
 *
 * Usage: DATABASE_URL=postgresql://tank:tank@localhost:5432/tank bun run scripts/seed-docker.ts
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import postgres from 'postgres';

const SKILLS_DIR = '/tmp/tank-skills/skills';
const PUBLISHER_ID = 'seed-user-001';
const ORG_ID = 'seed-org-tank';

const FEATURED_SKILLS = ['@tank/react', '@tank/typescript', '@tank/skill-creator'];
const STARRED_SKILLS = ['@tank/react', '@tank/nextjs', '@tank/typescript', '@tank/tailwind', '@tank/clean-code'];

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function uuid(): string {
  return crypto.randomUUID();
}

function countFiles(dir: string): number {
  let count = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isFile()) count++;
    else if (entry.isDirectory()) count += countFiles(join(dir, entry.name));
  }
  return count;
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }

  const sql = postgres(databaseUrl);

  try {
    // Verify skills directory exists
    try {
      readdirSync(SKILLS_DIR);
    } catch {
      console.error(`Skills directory not found: ${SKILLS_DIR}`);
      console.error('Clone the repo first: git clone --depth 1 https://github.com/tankpkg/skills.git /tmp/tank-skills');
      process.exit(1);
    }

    console.log('Creating pg_trgm extension...');
    await sql`CREATE EXTENSION IF NOT EXISTS pg_trgm`;

    // Clean existing seed data (idempotent)
    console.log('Cleaning existing seed data...');
    await sql`DELETE FROM scan_findings WHERE scan_id IN (SELECT id FROM scan_results WHERE version_id IN (SELECT id FROM skill_versions WHERE published_by = ${PUBLISHER_ID}))`;
    await sql`DELETE FROM scan_results WHERE version_id IN (SELECT id FROM skill_versions WHERE published_by = ${PUBLISHER_ID})`;
    await sql`DELETE FROM skill_download_daily WHERE skill_id IN (SELECT id FROM skills WHERE publisher_id = ${PUBLISHER_ID})`;
    await sql`DELETE FROM skill_stars WHERE skill_id IN (SELECT id FROM skills WHERE publisher_id = ${PUBLISHER_ID})`;
    await sql`DELETE FROM skill_versions WHERE published_by = ${PUBLISHER_ID}`;
    await sql`DELETE FROM skills WHERE publisher_id = ${PUBLISHER_ID}`;
    await sql`DELETE FROM member WHERE user_id = ${PUBLISHER_ID}`;
    await sql`DELETE FROM organization WHERE id = ${ORG_ID}`;
    await sql`DELETE FROM account WHERE user_id = ${PUBLISHER_ID}`;
    await sql`DELETE FROM "user" WHERE id = ${PUBLISHER_ID}`;

    // 1. Insert publisher user
    console.log('Inserting publisher user...');
    await sql`
      INSERT INTO "user" (id, name, email, email_verified, github_username, role, created_at, updated_at)
      VALUES (${PUBLISHER_ID}, 'Tank Bot', 'bot@tankpkg.dev', true, 'tankpkg', 'admin', now(), now())
    `;

    // 2. Insert account (no password — not testing login)
    await sql`
      INSERT INTO account (id, account_id, provider_id, user_id, created_at, updated_at)
      VALUES ('seed-account-001', ${PUBLISHER_ID}, 'credential', ${PUBLISHER_ID}, now(), now())
    `;

    // 3. Insert organization
    console.log('Inserting organization...');
    await sql`
      INSERT INTO organization (id, name, slug, created_at)
      VALUES (${ORG_ID}, 'Tank', 'tank', now())
    `;

    await sql`
      INSERT INTO member (id, organization_id, user_id, role, created_at)
      VALUES ('seed-member-001', ${ORG_ID}, ${PUBLISHER_ID}, 'owner', now())
    `;

    // 4. Read and insert all skills
    const skillDirs = readdirSync(SKILLS_DIR).filter((name) => {
      const p = join(SKILLS_DIR, name);
      return statSync(p).isDirectory() && statSync(join(p, 'skills.json')).isFile();
    });

    console.log(`Found ${skillDirs.length} skills to seed...`);

    for (const dirName of skillDirs) {
      const skillDir = join(SKILLS_DIR, dirName);
      const manifestRaw = readFileSync(join(skillDir, 'skills.json'), 'utf-8');
      const manifest = JSON.parse(manifestRaw);

      let readme = '';
      try {
        readme = readFileSync(join(skillDir, 'SKILL.md'), 'utf-8');
      } catch {
        // Some skills might not have SKILL.md
      }

      const fileCount = countFiles(skillDir);
      const skillId = uuid();
      const versionId = uuid();
      const scanId = uuid();
      const name: string = manifest.name;
      const version: string = manifest.version || '1.0.0';
      const description: string = manifest.description || '';
      const permissions = manifest.permissions || {};
      const isFeatured = FEATURED_SKILLS.includes(name);
      const auditScore = randomInt(7, 10);
      const tarballSize = randomInt(10_000, 200_000);
      const durationMs = randomInt(1000, 5000);

      // Insert skill
      await sql`
        INSERT INTO skills (id, name, description, publisher_id, org_id, repository_url, visibility, status, featured, created_at, updated_at)
        VALUES (
          ${skillId}, ${name}, ${description}, ${PUBLISHER_ID}, ${ORG_ID},
          ${manifest.repository || 'https://github.com/tankpkg/skills'},
          'public', 'active', ${isFeatured},
          now() - interval '${sql.unsafe(String(randomInt(1, 90)))} days',
          now() - interval '${sql.unsafe(String(randomInt(0, 7)))} days'
        )
      `;

      // Insert skill version
      await sql`
        INSERT INTO skill_versions (id, skill_id, version, integrity, tarball_path, tarball_size, file_count, manifest, permissions, audit_score, audit_status, readme, published_by, created_at)
        VALUES (
          ${versionId}, ${skillId}, ${version},
          ${'sha512-seed' + crypto.randomUUID().replace(/-/g, '')},
          ${'skills/' + skillId + '/' + version + '.tgz'},
          ${tarballSize}, ${fileCount},
          ${sql.json(manifest)}, ${sql.json(permissions)},
          ${auditScore}, 'completed', ${readme}, ${PUBLISHER_ID},
          now() - interval '${sql.unsafe(String(randomInt(1, 60)))} days'
        )
      `;

      // Insert scan results
      await sql`
        INSERT INTO scan_results (id, version_id, verdict, total_findings, critical_count, high_count, medium_count, low_count, stages_run, duration_ms, created_at)
        VALUES (
          ${scanId}, ${versionId}, 'pass', 0, 0, 0, 0, 0,
          ${sql.json(['stage0', 'stage1', 'stage2', 'stage3', 'stage4', 'stage5'])},
          ${durationMs},
          now() - interval '${sql.unsafe(String(randomInt(1, 60)))} days'
        )
      `;

      // Insert download counts for past 7 days
      for (let day = 0; day < 7; day++) {
        const downloads = randomInt(10, 500);
        await sql`
          INSERT INTO skill_download_daily (id, skill_id, date, count)
          VALUES (${uuid()}, ${skillId}, (current_date - ${sql.unsafe(String(day))}::int)::date, ${downloads})
        `;
      }

      // Insert stars for popular skills
      if (STARRED_SKILLS.includes(name)) {
        const starCount = randomInt(3, 8);
        for (let s = 0; s < starCount; s++) {
          // Create fake star users
          const starUserId = `star-user-${dirName}-${s}`;
          await sql`
            INSERT INTO "user" (id, name, email, email_verified, role, created_at, updated_at)
            VALUES (${starUserId}, ${'User ' + s}, ${`user${s}.${dirName}@example.com`}, true, 'user', now(), now())
            ON CONFLICT (id) DO NOTHING
          `;
          await sql`
            INSERT INTO skill_stars (id, skill_id, user_id, created_at)
            VALUES (${uuid()}, ${skillId}, ${starUserId}, now() - interval '${sql.unsafe(String(randomInt(1, 30)))} days')
            ON CONFLICT DO NOTHING
          `;
        }
      }

      console.log(`  ✓ ${name} v${version} (score: ${auditScore}, files: ${fileCount})`);
    }

    console.log(`\n✅ Seeded ${skillDirs.length} skills successfully!`);
    console.log('Verify: curl http://localhost:3000/api/v1/search?q=react');
  } catch (error) {
    console.error('Seed failed:', error);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

main();
