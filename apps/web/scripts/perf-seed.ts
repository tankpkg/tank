#!/usr/bin/env npx tsx
/**
 * Deterministic performance seed script.
 *
 * Creates a fixed dataset for reproducible perf measurements:
 *   - 1 perf user + 1 perf org + membership
 *   - 200 skills (scoped under @perf-org), each with 5 versions
 *   - 1 primary test skill (@test-org/test-skill) with 5 versions
 *   - Deterministic download rows per version
 *   - Scan results + findings for latest versions
 *
 * Idempotent: safe to run from clean or pre-seeded state.
 * Strategy: delete all perf-prefixed rows, then insert fresh.
 *
 * Usage:
 *   pnpm --filter=web run perf:seed
 *   DATABASE_URL=... npx tsx scripts/perf-seed.ts
 */

import postgres from 'postgres';
import { createHash, randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const PERF_USER_ID = deterministicUUID('perf-user', 0);
const PERF_ORG_ID = deterministicUUID('perf-org', 0);
const PERF_ORG_SLUG = 'perf-org';
const PERF_MEMBER_ID = deterministicUUID('perf-member', 0);

const TEST_ORG_ID = deterministicUUID('test-org', 0);
const TEST_ORG_SLUG = 'test-org';
const TEST_MEMBER_ID = deterministicUUID('test-member', 0);

const SKILL_COUNT = 200;
const VERSIONS_PER_SKILL = 5;
const DOWNLOADS_PER_VERSION = 3;

// Deterministic UUID generator: SHA-256 of namespace + index → UUID v4 format
function deterministicUUID(namespace: string, index: number): string {
  const hash = createHash('sha256')
    .update(`${namespace}:${index}`)
    .digest('hex');
  // Format as UUID v4: 8-4-4-4-12
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    '4' + hash.slice(13, 16), // version 4
    ((parseInt(hash[16], 16) & 0x3) | 0x8).toString(16) + hash.slice(17, 20), // variant
    hash.slice(20, 32),
  ].join('-');
}

// Deterministic timestamp: base date + offset
const BASE_DATE = new Date('2025-01-01T00:00:00Z');
function deterministicDate(dayOffset: number): Date {
  return new Date(BASE_DATE.getTime() + dayOffset * 86_400_000);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('ERROR: DATABASE_URL is required. Set it in .env.local or environment.');
    process.exit(1);
  }

  const sql = postgres(connectionString);

  try {
    console.log('[perf-seed] Starting deterministic seed...');
    const t0 = performance.now();

    // ── Phase 1: Clean up existing perf data ──────────────────────────────
    console.log('[perf-seed] Phase 1: Cleaning existing perf data...');
    await cleanupPerfData(sql);

    // ── Phase 2: Insert auth entities ─────────────────────────────────────
    console.log('[perf-seed] Phase 2: Inserting auth entities...');
    await insertAuthEntities(sql);

    // ── Phase 3: Insert skills + versions + downloads + scans ─────────────
    console.log('[perf-seed] Phase 3: Inserting skills and versions...');
    await insertSkillsAndVersions(sql);

    const elapsed = ((performance.now() - t0) / 1000).toFixed(1);
    console.log(`[perf-seed] Done in ${elapsed}s. Seeded ${SKILL_COUNT + 1} skills, ${(SKILL_COUNT + 1) * VERSIONS_PER_SKILL} versions.`);
  } catch (err) {
    console.error('[perf-seed] FATAL:', err);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

async function cleanupPerfData(sql: postgres.Sql) {
  // Find all perf-seeded skill IDs via publisher_id (points to user.id after publishers merge)
  const perfSkills = await sql<{ id: string }[]>`
    SELECT id FROM skills WHERE publisher_id = ${PERF_USER_ID}
  `;
  const skillIds = perfSkills.map((r) => r.id);

  if (skillIds.length > 0) {
    // Find all version IDs for these skills
    const perfVersions = await sql<{ id: string }[]>`
      SELECT id FROM skill_versions WHERE skill_id = ANY(${skillIds})
    `;
    const versionIds = perfVersions.map((r) => r.id);

    if (versionIds.length > 0) {
      const scanTableExists = await sql<{ exists: boolean }[]>`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = 'scan_results'
        ) AS exists
      `;

      if (scanTableExists[0]?.exists) {
        const scanIds = await sql<{ id: string }[]>`
          SELECT id FROM scan_results WHERE version_id = ANY(${versionIds})
        `;
        const scanIdList = scanIds.map((r) => r.id);

        if (scanIdList.length > 0) {
          await sql`DELETE FROM scan_findings WHERE scan_id = ANY(${scanIdList})`;
          await sql`DELETE FROM scan_results WHERE id = ANY(${scanIdList})`;
        }
      }

      await sql`DELETE FROM skill_downloads WHERE version_id = ANY(${versionIds})`;
      await sql`DELETE FROM skill_versions WHERE id = ANY(${versionIds})`;
    }

    await sql`DELETE FROM skills WHERE id = ANY(${skillIds})`;
  }

  // Delete auth entities
  await sql`DELETE FROM "member" WHERE id IN (${PERF_MEMBER_ID}, ${TEST_MEMBER_ID})`;
  await sql`DELETE FROM "organization" WHERE id IN (${PERF_ORG_ID}, ${TEST_ORG_ID})`;
  await sql`DELETE FROM "apikey" WHERE user_id = ${PERF_USER_ID}`;
  await sql`DELETE FROM "session" WHERE user_id = ${PERF_USER_ID}`;
  await sql`DELETE FROM "user" WHERE id = ${PERF_USER_ID}`;

  console.log(`[perf-seed]   Cleaned ${skillIds.length} skills and related data.`);
}

// ---------------------------------------------------------------------------
// Auth entities
// ---------------------------------------------------------------------------

async function insertAuthEntities(sql: postgres.Sql) {
  const now = new Date();

  await sql`
    INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
    VALUES (
      ${PERF_USER_ID},
      ${'Perf Seed User'},
      ${'perf-seed@tank.test'},
      true,
      ${now},
      ${now}
    )
  `;

  await sql`
    INSERT INTO "organization" (id, name, slug, created_at)
    VALUES (${PERF_ORG_ID}, ${'Perf Org'}, ${PERF_ORG_SLUG}, ${now})
  `;
  await sql`
    INSERT INTO "organization" (id, name, slug, created_at)
    VALUES (${TEST_ORG_ID}, ${'Test Org'}, ${TEST_ORG_SLUG}, ${now})
  `;

  // Memberships
  await sql`
    INSERT INTO "member" (id, organization_id, user_id, role, created_at)
    VALUES (${PERF_MEMBER_ID}, ${PERF_ORG_ID}, ${PERF_USER_ID}, ${'owner'}, ${now})
  `;
  await sql`
    INSERT INTO "member" (id, organization_id, user_id, role, created_at)
    VALUES (${TEST_MEMBER_ID}, ${TEST_ORG_ID}, ${PERF_USER_ID}, ${'owner'}, ${now})
  `;

  console.log('[perf-seed]   Created user, 2 orgs, 2 memberships.');
}

// ---------------------------------------------------------------------------
// Skills + versions + downloads + scans
// ---------------------------------------------------------------------------

async function insertSkillsAndVersions(sql: postgres.Sql) {
  // Build all skill definitions
  const skillDefs: Array<{
    id: string;
    name: string;
    description: string;
    orgId: string;
    index: number;
  }> = [];

  // 200 perf skills: @perf-org/perf-skill-000 .. @perf-org/perf-skill-199
  for (let i = 0; i < SKILL_COUNT; i++) {
    const padded = String(i).padStart(3, '0');
    skillDefs.push({
      id: deterministicUUID('skill', i),
      name: `@perf-org/perf-skill-${padded}`,
      description: `Performance test skill ${padded} for benchmarking registry read paths`,
      orgId: PERF_ORG_ID,
      index: i,
    });
  }

  // Primary test skill: @test-org/test-skill
  skillDefs.push({
    id: deterministicUUID('skill', SKILL_COUNT),
    name: '@test-org/test-skill',
    description: 'Primary test skill for performance budget route validation',
    orgId: TEST_ORG_ID,
    index: SKILL_COUNT,
  });

  // Batch insert skills
  console.log(`[perf-seed]   Inserting ${skillDefs.length} skills...`);
  for (let batch = 0; batch < skillDefs.length; batch += 50) {
    const chunk = skillDefs.slice(batch, batch + 50);
    const values = chunk.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      publisher_id: PERF_USER_ID,
      org_id: s.orgId,
      created_at: deterministicDate(s.index),
      updated_at: deterministicDate(s.index + 1),
    }));

    await sql`
      INSERT INTO skills ${sql(values, 'id', 'name', 'description', 'publisher_id', 'org_id', 'created_at', 'updated_at')}
    `;
  }

  // Insert versions, downloads, and scans for each skill
  console.log(`[perf-seed]   Inserting versions, downloads, and scans...`);

  // Collect all versions, downloads, and scans for batch insert
  const allVersions: Array<{
    id: string;
    skill_id: string;
    version: string;
    integrity: string;
    tarball_path: string;
    tarball_size: number;
    file_count: number;
    manifest: string;
    permissions: string;
    audit_score: number;
    audit_status: string;
    readme: string;
    published_by: string;
    created_at: Date;
  }> = [];

  const allDownloads: Array<{
    id: string;
    skill_id: string;
    version_id: string;
    ip_hash: string;
    user_agent: string;
    created_at: Date;
  }> = [];

  const allScanResults: Array<{
    id: string;
    version_id: string;
    verdict: string;
    total_findings: number;
    critical_count: number;
    high_count: number;
    medium_count: number;
    low_count: number;
    stages_run: string;
    duration_ms: number;
    created_at: Date;
  }> = [];

  const allScanFindings: Array<{
    id: string;
    scan_id: string;
    stage: string;
    severity: string;
    type: string;
    description: string;
    location: string;
    confidence: number;
    tool: string;
    evidence: string;
    created_at: Date;
  }> = [];

  for (const skill of skillDefs) {
    const semverVersions = ['1.0.0', '1.1.0', '1.2.0', '2.0.0', '2.1.0'];

    for (let v = 0; v < VERSIONS_PER_SKILL; v++) {
      const versionId = deterministicUUID(`version:${skill.index}`, v);
      const version = semverVersions[v];
      const integrityHash = createHash('sha512')
        .update(`${skill.name}@${version}`)
        .digest('base64');
      const tarballPath = `${skill.name.replace('@', '')}/${version}.tgz`;
      const publishedDate = deterministicDate(skill.index * VERSIONS_PER_SKILL + v);

      const manifest = JSON.stringify({
        name: skill.name,
        version,
        description: skill.description,
        license: 'MIT',
        files: [
          'SKILL.md',
          'index.ts',
          'README.md',
          'package.json',
          'lib/helpers.ts',
        ],
        permissions: {
          network: { outbound: ['*.example.com'] },
          filesystem: { read: ['./src/**'] },
          subprocess: false,
        },
      });

      const permissions = JSON.stringify({
        network: { outbound: ['*.example.com'] },
        filesystem: { read: ['./src/**'] },
        subprocess: false,
      });

      const readme = [
        `# ${skill.name}`,
        '',
        skill.description,
        '',
        '## Installation',
        '',
        '```bash',
        `tank install ${skill.name}`,
        '```',
        '',
        '## Usage',
        '',
        'This skill provides automated testing capabilities for performance benchmarking.',
        '',
        '## License',
        '',
        'MIT',
      ].join('\n');

      allVersions.push({
        id: versionId,
        skill_id: skill.id,
        version,
        integrity: `sha512-${integrityHash}`,
        tarball_path: tarballPath,
        tarball_size: 10240 + skill.index * 100 + v * 50,
        file_count: 5,
        manifest,
        permissions,
        audit_score: 8.5 + (v % 3) * 0.5, // 8.5, 9.0, 9.5, 8.5, 9.0
        audit_status: 'completed',
        readme,
        published_by: PERF_USER_ID,
        created_at: publishedDate,
      });

      // Downloads (deterministic)
      for (let d = 0; d < DOWNLOADS_PER_VERSION; d++) {
        const downloadId = deterministicUUID(`download:${skill.index}:${v}`, d);
        const ipHash = createHash('sha256')
          .update(`perf-ip-${skill.index}-${v}-${d}`)
          .digest('hex');

        allDownloads.push({
          id: downloadId,
          skill_id: skill.id,
          version_id: versionId,
          ip_hash: ipHash,
          user_agent: 'tank-cli/0.1.0 (perf-seed)',
          created_at: deterministicDate(skill.index * VERSIONS_PER_SKILL + v + d),
        });
      }

      // Scan results for latest version only (v === VERSIONS_PER_SKILL - 1)
      if (v === VERSIONS_PER_SKILL - 1) {
        const scanId = deterministicUUID(`scan:${skill.index}`, 0);

        allScanResults.push({
          id: scanId,
          version_id: versionId,
          verdict: 'pass',
          total_findings: 1,
          critical_count: 0,
          high_count: 0,
          medium_count: 0,
          low_count: 1,
          stages_run: JSON.stringify(['stage0', 'stage1', 'stage2', 'stage3', 'stage4', 'stage5']),
          duration_ms: 150 + skill.index,
          created_at: publishedDate,
        });

        allScanFindings.push({
          id: deterministicUUID(`finding:${skill.index}`, 0),
          scan_id: scanId,
          stage: 'stage2',
          severity: 'low',
          type: 'suspicious_import',
          description: 'Import of node:child_process detected but subprocess permission not declared',
          location: 'lib/helpers.ts:3',
          confidence: 0.6,
          tool: 'static-analyzer',
          evidence: "import { exec } from 'node:child_process'",
          created_at: publishedDate,
        });
      }
    }
  }

  // Batch insert versions (chunks of 100)
  for (let batch = 0; batch < allVersions.length; batch += 100) {
    const chunk = allVersions.slice(batch, batch + 100);
    await sql`
      INSERT INTO skill_versions ${sql(
        chunk,
        'id', 'skill_id', 'version', 'integrity', 'tarball_path', 'tarball_size',
        'file_count', 'manifest', 'permissions', 'audit_score', 'audit_status',
        'readme', 'published_by', 'created_at',
      )}
    `;
  }
  console.log(`[perf-seed]   Inserted ${allVersions.length} versions.`);

  // Batch insert downloads (chunks of 500)
  for (let batch = 0; batch < allDownloads.length; batch += 500) {
    const chunk = allDownloads.slice(batch, batch + 500);
    await sql`
      INSERT INTO skill_downloads ${sql(
        chunk,
        'id', 'skill_id', 'version_id', 'ip_hash', 'user_agent', 'created_at',
      )}
    `;
  }
  console.log(`[perf-seed]   Inserted ${allDownloads.length} downloads.`);

  // Scan tables may not exist if migration 0001 hasn't been applied
  const scanTableExists = await sql<{ exists: boolean }[]>`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'scan_results'
    ) AS exists
  `;

  if (scanTableExists[0]?.exists) {
    for (let batch = 0; batch < allScanResults.length; batch += 100) {
      const chunk = allScanResults.slice(batch, batch + 100);
      await sql`
        INSERT INTO scan_results ${sql(
          chunk,
          'id', 'version_id', 'verdict', 'total_findings', 'critical_count',
          'high_count', 'medium_count', 'low_count', 'stages_run', 'duration_ms',
          'created_at',
        )}
      `;
    }
    console.log(`[perf-seed]   Inserted ${allScanResults.length} scan results.`);

    if (allScanFindings.length > 0) {
      for (let batch = 0; batch < allScanFindings.length; batch += 100) {
        const chunk = allScanFindings.slice(batch, batch + 100);
        await sql`
          INSERT INTO scan_findings ${sql(
            chunk,
            'id', 'scan_id', 'stage', 'severity', 'type', 'description',
            'location', 'confidence', 'tool', 'evidence', 'created_at',
          )}
        `;
      }
      console.log(`[perf-seed]   Inserted ${allScanFindings.length} scan findings.`);
    }
  } else {
    console.log('[perf-seed]   Skipped scan data (scan_results table not found).');
  }
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

main();
