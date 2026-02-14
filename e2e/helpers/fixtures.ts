/**
 * Fixtures — create temporary skill directories and consumer projects.
 * All temp files are created under os.tmpdir() and cleaned up after tests.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// ---------------------------------------------------------------------------
// Skill fixture (for producers)
// ---------------------------------------------------------------------------

export interface SkillFixture {
  /** Absolute path to the temp skill directory */
  dir: string;
  /** Skill name (e.g., @e2etest-abc/my-skill) */
  name: string;
  /** Skill version */
  version: string;
}

/**
 * Create a temporary skill directory with valid skills.json + SKILL.md.
 * Ready for `tank publish`.
 */
export function createSkillFixture(opts: {
  orgSlug: string;
  skillName: string;
  version?: string;
  description?: string;
  permissions?: Record<string, unknown>;
  extraFiles?: Record<string, string>;
}): SkillFixture {
  const version = opts.version ?? '1.0.0';
  const name = `@${opts.orgSlug}/${opts.skillName}`;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tank-skill-'));

  // skills.json
  const manifest = {
    name,
    version,
    description: opts.description ?? `E2E test skill: ${opts.skillName}`,
    permissions: opts.permissions ?? {
      network: { outbound: ['*.example.com'] },
      filesystem: { read: ['./src/**'] },
      subprocess: false,
    },
  };
  fs.writeFileSync(
    path.join(dir, 'skills.json'),
    JSON.stringify(manifest, null, 2) + '\n',
  );

  // SKILL.md (required by packer)
  fs.writeFileSync(
    path.join(dir, 'SKILL.md'),
    `# ${name}\n\nE2E test skill for Tank registry.\n\n## Usage\n\nThis is a test fixture.\n`,
  );

  // index.js (default content)
  fs.writeFileSync(
    path.join(dir, 'index.js'),
    `export const name = '${name}';\nexport const version = '${version}';\nexport function execute() { return 'hello from ${name}'; }\n`,
  );

  // Extra files (if any)
  if (opts.extraFiles) {
    for (const [relPath, content] of Object.entries(opts.extraFiles)) {
      const fullPath = path.join(dir, relPath);
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, content);
    }
  }

  return { dir, name, version };
}

/**
 * Update the version in a skill fixture's skills.json.
 */
export function bumpSkillVersion(fixture: SkillFixture, newVersion: string): void {
  const manifestPath = path.join(fixture.dir, 'skills.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  manifest.version = newVersion;
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  fixture.version = newVersion;
}

// ---------------------------------------------------------------------------
// Consumer project fixture (for consumers)
// ---------------------------------------------------------------------------

export interface ConsumerFixture {
  /** Absolute path to the temp consumer project directory */
  dir: string;
}

/**
 * Create a temporary consumer project directory with skills.json.
 * Ready for `tank install <skill>`.
 */
export function createConsumerFixture(opts?: {
  /** Permission budget for the consumer project */
  permissions?: Record<string, unknown>;
  /** Pre-populate skills map (installed skills) */
  skills?: Record<string, string>;
}): ConsumerFixture {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tank-consumer-'));

  const manifest = {
    name: 'e2e-consumer-project',
    version: '1.0.0',
    description: 'E2E test consumer project',
    skills: opts?.skills ?? {},
    permissions: opts?.permissions ?? {
      network: { outbound: ['*.example.com'] },
      filesystem: { read: ['./src/**'], write: [] },
      subprocess: false,
    },
  };

  fs.writeFileSync(
    path.join(dir, 'skills.json'),
    JSON.stringify(manifest, null, 2) + '\n',
  );

  // Create SKILL.md so the directory validates as a skill project
  fs.writeFileSync(
    path.join(dir, 'SKILL.md'),
    `# E2E Consumer Project\n\nTest consumer for Tank E2E tests.\n`,
  );

  return { dir };
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

/**
 * Remove a temporary directory and all its contents.
 */
export function cleanupFixture(dirPath: string): void {
  try {
    fs.rmSync(dirPath, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}
