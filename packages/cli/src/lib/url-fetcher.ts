/**
 * Fetch skills from URLs for `tank install <url>`.
 * Routes GitHub (git clone), ClawHub (zip), skills.sh, and generic tarballs
 * to temp directories with cleanup-on-failure semantics.
 */

import { execSync } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdir, mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import { logger } from './logger.js';

export type UrlSourceType = 'github' | 'clawhub' | 'skills_sh' | 'agentskills_il' | 'npm' | 'file' | 'unknown';

export interface FetchResult {
  /** Local directory containing the fetched skill files */
  localPath: string;
  /** Detected source type */
  sourceType: UrlSourceType;
  /** Original URL */
  sourceUrl: string;
  /** Git commit SHA if available */
  commitSha: string | null;
  /** Inferred skill name from URL */
  inferredName: string | null;
  /** Cleanup function — call after install completes or on error */
  cleanup: () => Promise<void>;
}

export interface FetchError {
  success: false;
  error: string;
}

export type FetchOutput = ({ success: true } & FetchResult) | FetchError;

const HOST_MAP: Array<[RegExp, UrlSourceType]> = [
  [/github\.com/i, 'github'],
  [/clawhub\.ai/i, 'clawhub'],
  [/skills\.sh/i, 'skills_sh'],
  [/agentskills\.co\.il/i, 'agentskills_il'],
  [/registry\.npmjs\.org/i, 'npm']
];

function detectSourceType(url: string): UrlSourceType {
  if (url.startsWith('file://')) return 'file';
  for (const [pattern, sourceType] of HOST_MAP) {
    if (pattern.test(url)) return sourceType;
  }
  return 'unknown';
}

/** Returns true if the input looks like a URL rather than a package name. */
export function isUrl(input: string): boolean {
  if (input.startsWith('http://') || input.startsWith('https://') || input.startsWith('file://')) return true;
  for (const [pattern] of HOST_MAP) {
    if (pattern.test(input)) return true;
  }
  return false;
}

/** Best-effort skill name extraction from a URL. */
export function inferSkillName(url: string): string | null {
  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
    const segments = parsed.pathname
      .replace(/\.git$/, '')
      .split('/')
      .filter(Boolean);
    const sourceType = detectSourceType(url);

    switch (sourceType) {
      case 'github': {
        // github.com/{owner}/{repo}[/tree/{branch}/{path}...]
        if (segments.length < 2) return null;
        const treeIdx = segments.indexOf('tree');
        if (treeIdx !== -1 && segments.length > treeIdx + 2) {
          return segments[segments.length - 1] ?? null;
        }
        return segments[1] ?? null;
      }
      case 'clawhub': // clawhub.ai/{owner}/{skill-name}
        return segments[1] ?? null;
      case 'skills_sh': // skills.sh/{owner}/{repo}/{skill-name}
        return segments[2] ?? segments[1] ?? null;
      case 'agentskills_il': // agentskills.co.il/{owner}/{skill-name}
        return segments[1] ?? null;
      case 'npm': // registry.npmjs.org/{scope}/{name} or /{name}
        return segments[segments.length - 1] ?? null;
      default:
        return segments[segments.length - 1] ?? null;
    }
  } catch {
    return null;
  }
}

async function createTempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'tank-fetch-'));
}

async function cleanupDir(dir: string): Promise<void> {
  try {
    await rm(dir, { recursive: true, force: true });
  } catch {
    /* best-effort */
  }
}

function ensureGitInstalled(): void {
  try {
    execSync('git --version', { stdio: 'ignore' });
  } catch {
    throw new Error('Git is not installed. Install git and try again.');
  }
}

function gitCloneShallow(repoUrl: string, dest: string): void {
  try {
    execSync(`git clone --depth 1 ${repoUrl} ${dest}`, {
      stdio: 'pipe',
      timeout: 60_000
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('Repository not found') || msg.includes('not found')) {
      throw new Error(`Repository not found: ${repoUrl}`);
    }
    if (msg.includes('timed out') || msg.includes('ETIMEDOUT')) {
      throw new Error(`Network timeout cloning ${repoUrl}`);
    }
    throw new Error(`Git clone failed: ${msg}`);
  }
}

function gitRevParseHead(dir: string): string | null {
  try {
    return execSync('git rev-parse HEAD', { cwd: dir, stdio: 'pipe' }).toString().trim();
  } catch {
    return null;
  }
}

async function downloadFile(url: string, dest: string): Promise<void> {
  const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });

  if (!res.ok) {
    if (res.status === 404) throw new Error(`Not found: ${url}`);
    throw new Error(`HTTP ${res.status} downloading ${url}`);
  }
  if (!res.body) throw new Error(`Empty response body from ${url}`);

  const nodeStream = Readable.fromWeb(res.body as unknown as import('node:stream/web').ReadableStream);
  await pipeline(nodeStream, createWriteStream(dest));
}

async function extractZip(zipPath: string, dest: string): Promise<void> {
  try {
    execSync(`unzip -o -q "${zipPath}" -d "${dest}"`, { stdio: 'pipe', timeout: 30_000 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Zip extraction failed: ${msg}`);
  }
}

async function extractTarball(tarPath: string, dest: string): Promise<void> {
  try {
    execSync(`tar xzf "${tarPath}" -C "${dest}"`, { stdio: 'pipe', timeout: 30_000 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Tarball extraction failed: ${msg}`);
  }
}

interface GitHubUrlParts {
  owner: string;
  repo: string;
  branch: string | null;
  subpath: string | null;
}

function parseGitHubUrl(url: string): GitHubUrlParts | null {
  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
    const segments = parsed.pathname
      .replace(/\.git$/, '')
      .split('/')
      .filter(Boolean);
    if (segments.length < 2) return null;

    const owner = segments[0];
    const repo = segments[1];
    let branch: string | null = null;
    let subpath: string | null = null;

    // Pattern: /tree/{branch}[/{path}...]
    if (segments[2] === 'tree' && segments.length > 3) {
      branch = segments[3];
      if (segments.length > 4) {
        subpath = segments.slice(4).join('/');
      }
    }

    return { owner, repo, branch, subpath };
  } catch {
    return null;
  }
}

async function fetchFromGitHub(url: string, tempDir: string): Promise<FetchResult> {
  ensureGitInstalled();

  const parts = parseGitHubUrl(url);
  if (!parts) throw new Error(`Invalid GitHub URL: ${url}`);

  const cloneUrl = `https://github.com/${parts.owner}/${parts.repo}.git`;
  const cloneDest = join(tempDir, parts.repo);

  logger.info(`Cloning ${parts.owner}/${parts.repo}...`);
  gitCloneShallow(cloneUrl, cloneDest);

  if (parts.branch) {
    try {
      execSync(`git checkout ${parts.branch}`, { cwd: cloneDest, stdio: 'pipe', timeout: 10_000 });
    } catch {
      // Shallow clone of default branch may already match — safe to continue
    }
  }

  const commitSha = gitRevParseHead(cloneDest);
  let localPath = cloneDest;

  if (parts.subpath) {
    const subDir = join(cloneDest, parts.subpath);
    try {
      const s = await stat(subDir);
      if (s.isDirectory()) localPath = subDir;
    } catch {
      throw new Error(`Subpath not found in repo: ${parts.subpath}`);
    }
  }

  return {
    localPath,
    sourceType: 'github',
    sourceUrl: url,
    commitSha,
    inferredName: parts.subpath ? (parts.subpath.split('/').pop() ?? parts.repo) : parts.repo,
    cleanup: () => cleanupDir(tempDir)
  };
}

interface ClawHubUrlParts {
  owner: string;
  skillName: string;
}

function parseClawHubUrl(url: string): ClawHubUrlParts | null {
  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
    const segments = parsed.pathname.split('/').filter(Boolean);
    if (segments.length < 2) return null;
    return { owner: segments[0], skillName: segments[1] };
  } catch {
    return null;
  }
}

async function fetchFromClawHub(url: string, tempDir: string): Promise<FetchResult> {
  const parts = parseClawHubUrl(url);
  if (!parts) throw new Error(`Invalid ClawHub URL: ${url}`);

  logger.info(`Fetching ${parts.owner}/${parts.skillName} from ClawHub...`);

  const pageUrl = url.startsWith('http') ? url : `https://${url}`;
  const pageRes = await fetch(pageUrl, { signal: AbortSignal.timeout(30_000) });

  if (!pageRes.ok) {
    if (pageRes.status === 404) throw new Error(`Skill not found on ClawHub: ${parts.skillName}`);
    throw new Error(`HTTP ${pageRes.status} fetching ClawHub page`);
  }

  const html = await pageRes.text();

  // Regex: match Convex storage URLs with "download" or direct .zip links
  const downloadUrlMatch =
    html.match(/https?:\/\/[^\s"']+\.convex\.cloud[^\s"']*download[^\s"']*/i) ??
    html.match(/https?:\/\/[^\s"']+\.zip/i);

  if (!downloadUrlMatch) {
    throw new Error('Could not find download URL on ClawHub page. The skill may not have a downloadable archive.');
  }

  const zipPath = join(tempDir, `${parts.skillName}.zip`);
  await downloadFile(downloadUrlMatch[0], zipPath);

  const extractDir = join(tempDir, parts.skillName);
  await mkdir(extractDir, { recursive: true });
  await extractZip(zipPath, extractDir);

  return {
    localPath: extractDir,
    sourceType: 'clawhub',
    sourceUrl: url,
    commitSha: null,
    inferredName: parts.skillName,
    cleanup: () => cleanupDir(tempDir)
  };
}

interface SkillsShUrlParts {
  owner: string;
  repo: string;
  skillName: string | null;
}

function parseSkillsShUrl(url: string): SkillsShUrlParts | null {
  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
    const segments = parsed.pathname.split('/').filter(Boolean);
    if (segments.length < 2) return null;
    return { owner: segments[0], repo: segments[1], skillName: segments[2] ?? null };
  } catch {
    return null;
  }
}

async function fetchFromSkillsSh(url: string, tempDir: string): Promise<FetchResult> {
  ensureGitInstalled();

  const parts = parseSkillsShUrl(url);
  if (!parts) throw new Error(`Invalid skills.sh URL: ${url}`);

  const cloneUrl = `https://github.com/${parts.owner}/${parts.repo}.git`;
  const cloneDest = join(tempDir, parts.repo);

  logger.info(`Cloning ${parts.owner}/${parts.repo} (via skills.sh)...`);
  gitCloneShallow(cloneUrl, cloneDest);

  const commitSha = gitRevParseHead(cloneDest);
  let localPath = cloneDest;
  const inferredName = parts.skillName ?? parts.repo;

  if (parts.skillName) {
    const candidates = [
      join(cloneDest, 'skills', parts.skillName),
      join(cloneDest, 'src', 'skills', parts.skillName),
      join(cloneDest, parts.skillName)
    ];

    let found = false;
    for (const candidate of candidates) {
      try {
        const s = await stat(candidate);
        if (s.isDirectory()) {
          localPath = candidate;
          found = true;
          break;
        }
      } catch {
        /* try next */
      }
    }

    if (!found) {
      throw new Error(
        `Skill "${parts.skillName}" not found in ${parts.repo}. ` +
          `Searched: skills/${parts.skillName}, src/skills/${parts.skillName}, ${parts.skillName}`
      );
    }
  }

  return {
    localPath,
    sourceType: 'skills_sh',
    sourceUrl: url,
    commitSha,
    inferredName,
    cleanup: () => cleanupDir(tempDir)
  };
}

async function fetchFromGenericUrl(url: string, tempDir: string): Promise<FetchResult> {
  const fullUrl = url.startsWith('http') ? url : `https://${url}`;

  logger.info(`Downloading from ${fullUrl}...`);

  const isTarball = /\.(tar\.gz|tgz)(\?|$)/i.test(fullUrl);
  const isZip = /\.zip(\?|$)/i.test(fullUrl);

  if (!isTarball && !isZip) {
    const archivePath = join(tempDir, 'skill.tar.gz');
    await downloadFile(fullUrl, archivePath);

    const extractDir = join(tempDir, 'skill');
    await mkdir(extractDir, { recursive: true });

    try {
      await extractTarball(archivePath, extractDir);
    } catch {
      try {
        await extractZip(archivePath, extractDir);
      } catch {
        throw new Error(`Failed to extract archive from ${fullUrl}. Expected .tar.gz or .zip format.`);
      }
    }

    return {
      localPath: extractDir,
      sourceType: detectSourceType(url),
      sourceUrl: url,
      commitSha: null,
      inferredName: inferSkillName(url),
      cleanup: () => cleanupDir(tempDir)
    };
  }

  const ext = isTarball ? 'tar.gz' : 'zip';
  const archivePath = join(tempDir, `skill.${ext}`);
  await downloadFile(fullUrl, archivePath);

  const extractDir = join(tempDir, 'skill');
  await mkdir(extractDir, { recursive: true });

  if (isTarball) {
    await extractTarball(archivePath, extractDir);
  } else {
    await extractZip(archivePath, extractDir);
  }

  return {
    localPath: extractDir,
    sourceType: detectSourceType(url),
    sourceUrl: url,
    commitSha: null,
    inferredName: inferSkillName(url),
    cleanup: () => cleanupDir(tempDir)
  };
}

async function fetchFromFileUrl(url: string, tempDir: string): Promise<FetchResult> {
  const sourcePath = new URL(url).pathname;
  const destDir = join(tempDir, 'skill');
  const { cp } = await import('node:fs/promises');
  await mkdir(destDir, { recursive: true });
  await cp(sourcePath, destDir, { recursive: true, errorOnExist: false });
  const inferredName = sourcePath.replace(/\/$/, '').split('/').pop() ?? null;
  return {
    localPath: destDir,
    sourceType: 'file',
    sourceUrl: url,
    commitSha: null,
    inferredName,
    cleanup: () => cleanupDir(tempDir)
  };
}

/** Fetch a skill from a URL to a local temp directory. */
export async function fetchFromUrl(url: string): Promise<FetchOutput> {
  const sourceType = detectSourceType(url);
  let tempDir: string | null = null;

  try {
    tempDir = await createTempDir();

    let result: FetchResult;

    switch (sourceType) {
      case 'github':
        result = await fetchFromGitHub(url, tempDir);
        break;
      case 'clawhub':
        result = await fetchFromClawHub(url, tempDir);
        break;
      case 'skills_sh':
        result = await fetchFromSkillsSh(url, tempDir);
        break;
      case 'file':
        result = await fetchFromFileUrl(url, tempDir);
        break;
      default:
        result = await fetchFromGenericUrl(url, tempDir);
        break;
    }

    return { success: true, ...result };
  } catch (err) {
    if (tempDir) await cleanupDir(tempDir);
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}
