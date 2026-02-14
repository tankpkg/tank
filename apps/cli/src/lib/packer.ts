import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import { create } from 'tar';
import ignore from 'ignore';
import { skillsJsonSchema } from '@tank/shared';

// Limits
const MAX_PACKAGE_SIZE = 50 * 1024 * 1024; // 50MB
const MAX_FILE_COUNT = 1000;

// Default ignore patterns (used when no .tankignore or .gitignore exists)
const DEFAULT_IGNORES = [
  'node_modules',
  '.git',
  '.env*',
  '*.log',
  '.tank',
  '.DS_Store',
];

// Always ignored regardless of ignore file contents
const ALWAYS_IGNORED = [
  'node_modules',
  '.git',
];

// Ignore file names (not packed into tarball)
const IGNORE_FILES = ['.tankignore', '.gitignore'];

export interface PackResult {
  tarball: Buffer;
  integrity: string; // "sha512-{base64}"
  fileCount: number;
  totalSize: number;
  readme: string;
  files: string[];
}

/**
 * Pack a skill directory into a .tgz tarball with integrity hashing.
 *
 * Validates:
 * - skills.json exists and is valid
 * - SKILL.md exists
 * - No symlinks or hardlinks
 * - No path traversal (.. components)
 * - No absolute paths
 * - File count <= 1000
 * - Tarball size <= 50MB
 */
export async function pack(directory: string): Promise<PackResult> {
  const absDir = path.resolve(directory);

  // 1. Verify directory exists
  if (!fs.existsSync(absDir)) {
    throw new Error(`Directory does not exist: ${absDir}`);
  }

  const stat = fs.statSync(absDir);
  if (!stat.isDirectory()) {
    throw new Error(`Not a directory: ${absDir}`);
  }

  // 2. Verify skills.json exists and is valid
  const skillsJsonPath = path.join(absDir, 'skills.json');
  if (!fs.existsSync(skillsJsonPath)) {
    throw new Error('Missing required file: skills.json');
  }

  let skillsJsonContent: string;
  try {
    skillsJsonContent = fs.readFileSync(skillsJsonPath, 'utf-8');
  } catch {
    throw new Error('Failed to read skills.json');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(skillsJsonContent);
  } catch {
    throw new Error('Invalid skills.json: not valid JSON');
  }

  const validation = skillsJsonSchema.safeParse(parsed);
  if (!validation.success) {
    const issues = validation.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid skills.json:\n${issues}`);
  }

  // 3. Verify SKILL.md exists and read its content
  const skillMdPath = path.join(absDir, 'SKILL.md');
  if (!fs.existsSync(skillMdPath)) {
    throw new Error('Missing required file: SKILL.md');
  }

  let readmeContent: string;
  try {
    readmeContent = fs.readFileSync(skillMdPath, 'utf-8');
  } catch {
    throw new Error('Failed to read SKILL.md');
  }

  // 4. Build ignore filter
  const ig = buildIgnoreFilter(absDir);

  // 5. Collect files with validation
  const files = collectFiles(absDir, absDir, ig);

  // 6. Enforce file count limit
  if (files.length > MAX_FILE_COUNT) {
    throw new Error(
      `Too many files: ${files.length} exceeds maximum of ${MAX_FILE_COUNT}`,
    );
  }

  // 7. Calculate total size of source files
  let totalSize = 0;
  for (const file of files) {
    const filePath = path.join(absDir, file);
    const fileStat = fs.statSync(filePath);
    totalSize += fileStat.size;
  }

  // 8. Create tarball
  const tarball = await createTarball(absDir, files);

  // 9. Enforce tarball size limit
  if (tarball.length > MAX_PACKAGE_SIZE) {
    throw new Error(
      `Tarball too large: ${tarball.length} bytes exceeds maximum of ${MAX_PACKAGE_SIZE} bytes (50MB)`,
    );
  }

  // 10. Compute integrity hash
  const hash = crypto.createHash('sha512').update(tarball).digest('base64');
  const integrity = `sha512-${hash}`;

  return {
    tarball,
    integrity,
    fileCount: files.length,
    totalSize,
    readme: readmeContent,
    files,
  };
}

/**
 * Build an ignore filter from .tankignore, .gitignore, or defaults.
 */
function buildIgnoreFilter(dir: string): ReturnType<typeof ignore> {
  const ig = ignore();

  // Always add the forced ignores
  ig.add(ALWAYS_IGNORED);

  // Check for .tankignore first, then .gitignore, then defaults
  const tankIgnorePath = path.join(dir, '.tankignore');
  const gitIgnorePath = path.join(dir, '.gitignore');

  if (fs.existsSync(tankIgnorePath)) {
    const content = fs.readFileSync(tankIgnorePath, 'utf-8');
    ig.add(content);
    // Also ignore the ignore files themselves
    ig.add(IGNORE_FILES);
  } else if (fs.existsSync(gitIgnorePath)) {
    const content = fs.readFileSync(gitIgnorePath, 'utf-8');
    ig.add(content);
    ig.add(IGNORE_FILES);
  } else {
    ig.add(DEFAULT_IGNORES);
  }

  return ig;
}

/**
 * Recursively collect files from a directory, applying ignore rules and security checks.
 */
function collectFiles(
  baseDir: string,
  currentDir: string,
  ig: ReturnType<typeof ignore>,
): string[] {
  const files: string[] = [];
  const entries = fs.readdirSync(currentDir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(currentDir, entry.name);
    const relativePath = path.relative(baseDir, fullPath);

    // Security: check for path traversal
    if (relativePath.split(path.sep).includes('..')) {
      throw new Error(
        `Path traversal detected: "${relativePath}" contains ".." component`,
      );
    }

    // Security: check for absolute paths
    if (path.isAbsolute(relativePath)) {
      throw new Error(`Absolute path detected: "${relativePath}"`);
    }

    // Security: check for symlinks using lstat (not stat which follows symlinks)
    const lstatResult = fs.lstatSync(fullPath);
    if (lstatResult.isSymbolicLink()) {
      throw new Error(
        `Symlink detected: "${relativePath}" — symlinks are not allowed in skill packages`,
      );
    }

    // Check if this path should be ignored
    // For directories, append '/' so ignore patterns like 'dir/' work correctly
    const pathForIgnore = lstatResult.isDirectory()
      ? relativePath + '/'
      : relativePath;

    if (ig.ignores(pathForIgnore)) {
      continue;
    }

    if (lstatResult.isDirectory()) {
      // Recurse into subdirectory
      const subFiles = collectFiles(baseDir, fullPath, ig);
      files.push(...subFiles);
    } else if (lstatResult.isFile()) {
      files.push(relativePath);
    }
    // Skip other types (block devices, character devices, FIFOs, sockets)
  }

  return files;
}

/**
 * Create a gzipped tarball from the given files in the directory.
 */
async function createTarball(
  cwd: string,
  files: string[],
): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];

    // tar.create without `file` returns a readable stream
    const stream = create(
      {
        gzip: true,
        cwd,
        portable: true, // Omit system-specific metadata
      },
      files,
    ) as unknown as Readable;

    stream.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
    });

    stream.on('end', () => {
      resolve(Buffer.concat(chunks));
    });

    stream.on('error', (err: Error) => {
      reject(err);
    });
  });
}
