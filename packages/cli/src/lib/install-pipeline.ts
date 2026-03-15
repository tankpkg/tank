import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { LEGACY_MANIFEST_FILENAME, MANIFEST_FILENAME, type Permissions, type SkillsLock } from '@internal/shared';
import type ora from 'ora';
import { extract } from 'tar';
import { buildSkillKey, type ResolvedNode } from './dependency-resolver.js';
import { logger } from './logger.js';

export interface DownloadedTarball {
  buffer: Buffer;
  integrity: string;
  fromCache: boolean;
}

interface DownloadTarballWithCacheOptions {
  cacheDir: string;
  forceRefresh?: boolean;
}

function isVerboseMode(): boolean {
  return process.env.TANK_DEBUG === '1' || process.env.TANK_DEBUG === 'true';
}

function verboseCacheLog(message: string): void {
  if (isVerboseMode()) {
    logger.info(`[cache] ${message}`);
  }
}

function integrityToSha512Hex(integrity: string): string {
  if (!integrity.startsWith('sha512-')) {
    throw new Error(`Invalid integrity format: ${integrity}`);
  }

  const base64 = integrity.slice('sha512-'.length);
  return Buffer.from(base64, 'base64').toString('hex');
}

function buildIntegrity(buffer: Buffer): string {
  const hash = crypto.createHash('sha512').update(buffer).digest('base64');
  return `sha512-${hash}`;
}

export function getGlobalCacheDir(homedir: string): string {
  return path.join(homedir, '.tank', 'cache');
}

function getTarballCachePath(cacheDir: string, integrity: string): string {
  const sha512Hex = integrityToSha512Hex(integrity);
  return path.join(cacheDir, `${sha512Hex}.tgz`);
}

function readTarballFromCache(cachePath: string, integrity: string): Buffer | null {
  if (!fs.existsSync(cachePath)) {
    return null;
  }

  try {
    const cached = fs.readFileSync(cachePath);
    if (buildIntegrity(cached) !== integrity) {
      fs.rmSync(cachePath, { force: true });
      verboseCacheLog(`Cache integrity mismatch at ${cachePath}; removed entry`);
      return null;
    }
    return cached;
  } catch {
    fs.rmSync(cachePath, { force: true });
    return null;
  }
}

function writeTarballToCache(cachePath: string, tarball: Buffer): void {
  fs.mkdirSync(path.dirname(cachePath), { recursive: true });
  const tmpPath = `${cachePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmpPath, tarball);
  fs.renameSync(tmpPath, cachePath);
}

async function downloadTarball(url: string, skillLabel: string): Promise<Buffer> {
  let res: Response;
  try {
    res = await fetch(url);
  } catch (err) {
    throw new Error(
      `Network error downloading tarball for ${skillLabel}: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  if (!res.ok) {
    throw new Error(`Failed to download ${skillLabel}: ${res.status} ${res.statusText}`);
  }

  return Buffer.from(await res.arrayBuffer());
}

export async function downloadTarballWithCache(
  downloadUrl: string,
  expectedIntegrity: string,
  skillLabel: string,
  options: DownloadTarballWithCacheOptions
): Promise<DownloadedTarball> {
  const cachePath = getTarballCachePath(options.cacheDir, expectedIntegrity);

  if (options.forceRefresh) {
    fs.rmSync(cachePath, { force: true });
  }

  const cached = readTarballFromCache(cachePath, expectedIntegrity);
  if (cached) {
    verboseCacheLog(`Cache hit for ${skillLabel}`);
    return { buffer: cached, integrity: expectedIntegrity, fromCache: true };
  }

  verboseCacheLog(`Cache miss for ${skillLabel}`);
  const downloaded = await downloadTarball(downloadUrl, skillLabel);
  const computedIntegrity = buildIntegrity(downloaded);
  if (computedIntegrity !== expectedIntegrity) {
    throw new Error(`Integrity mismatch for ${skillLabel}. Expected: ${expectedIntegrity}, Got: ${computedIntegrity}`);
  }

  writeTarballToCache(cachePath, downloaded);
  return { buffer: downloaded, integrity: computedIntegrity, fromCache: false };
}

export async function downloadAllParallel(
  nodes: ResolvedNode[],
  spinner: ReturnType<typeof ora>,
  options: { cacheDir: string }
): Promise<Map<string, DownloadedTarball>> {
  const results = new Map<string, DownloadedTarball>();
  const CONCURRENCY_LIMIT = 8;

  for (let i = 0; i < nodes.length; i += CONCURRENCY_LIMIT) {
    const batch = nodes.slice(i, i + CONCURRENCY_LIMIT);
    const promises = batch.map(async (node) => {
      spinner.text = `Preparing ${node.name}@${node.version}...`;
      const downloaded = await downloadTarballWithCache(
        node.meta.downloadUrl,
        node.meta.integrity,
        `${node.name}@${node.version}`,
        {
          cacheDir: options.cacheDir
        }
      );
      return { name: node.name, downloaded };
    });

    const batchResults = await Promise.all(promises);
    for (const result of batchResults) {
      results.set(result.name, result.downloaded);
    }
  }

  return results;
}

export function verifyExtractedDependencies(extractDir: string, node: ResolvedNode): void {
  let extractedManifestPath = path.join(extractDir, MANIFEST_FILENAME);
  if (!fs.existsSync(extractedManifestPath)) {
    extractedManifestPath = path.join(extractDir, LEGACY_MANIFEST_FILENAME);
  }
  if (!fs.existsSync(extractedManifestPath)) {
    return;
  }

  try {
    const raw = fs.readFileSync(extractedManifestPath, 'utf-8');
    const manifest = JSON.parse(raw) as Record<string, unknown>;
    const extractedDeps = (manifest.skills ?? {}) as Record<string, string>;
    const apiDeps = node.meta.dependencies;
    const extractedSorted = Object.fromEntries(Object.entries(extractedDeps).sort(([a], [b]) => a.localeCompare(b)));
    const apiSorted = Object.fromEntries(Object.entries(apiDeps).sort(([a], [b]) => a.localeCompare(b)));
    if (JSON.stringify(extractedSorted) !== JSON.stringify(apiSorted)) {
      logger.warn(`Dependency mismatch for ${node.name}@${node.version}: manifest deps differ from registry`);
    }
  } catch {
    // Non-fatal.
  }
}

export function readExtractedDependencies(extractDir: string): Record<string, string> {
  let extractedManifestPath = path.join(extractDir, MANIFEST_FILENAME);
  if (!fs.existsSync(extractedManifestPath)) {
    extractedManifestPath = path.join(extractDir, LEGACY_MANIFEST_FILENAME);
  }
  if (!fs.existsSync(extractedManifestPath)) {
    return {};
  }

  try {
    const raw = fs.readFileSync(extractedManifestPath, 'utf-8');
    const manifest = JSON.parse(raw) as Record<string, unknown>;
    const extractedDeps = manifest.skills;
    if (!extractedDeps || typeof extractedDeps !== 'object') {
      return {};
    }

    const deps: Record<string, string> = {};
    for (const [depName, depRange] of Object.entries(extractedDeps as Record<string, unknown>)) {
      if (typeof depRange === 'string') {
        deps[depName] = depRange;
      }
    }
    return deps;
  } catch {
    return {};
  }
}

export function writeLockfileWithResolvedGraph(
  lock: SkillsLock,
  nodes: ResolvedNode[],
  downloaded: Map<string, { buffer: Buffer; integrity: string }>
): SkillsLock {
  for (const node of nodes) {
    const key = buildSkillKey(node.name, node.version);

    if (!downloaded.has(node.name) && lock.skills[key]) {
      continue;
    }

    const integrity = downloaded.get(node.name)?.integrity ?? lock.skills[key]?.integrity ?? node.meta.integrity;

    lock.skills[key] = {
      resolved: node.meta.downloadUrl,
      integrity,
      permissions: node.meta.permissions as Permissions,
      audit_score: node.meta.auditScore ?? null,
      dependencies: node.dependencies
    };
  }

  const sortedSkills: Record<string, unknown> = {};
  for (const key of Object.keys(lock.skills).sort()) {
    sortedSkills[key] = lock.skills[key];
  }
  lock.skills = sortedSkills as SkillsLock['skills'];
  return lock;
}

/**
 * Extract a tarball safely with security checks.
 * Rejects: absolute paths, path traversal (..), symlinks/hardlinks.
 */
export async function extractSafely(tarball: Buffer, destDir: string): Promise<void> {
  const tmpTarball = path.join(destDir, '.tmp-tarball.tgz');
  fs.writeFileSync(tmpTarball, tarball);

  try {
    await extract({
      file: tmpTarball,
      cwd: destDir,
      filter: (entryPath: string) => {
        if (path.isAbsolute(entryPath)) {
          throw new Error(`Absolute path in tarball: ${entryPath}`);
        }
        if (entryPath.split('/').includes('..') || entryPath.split(path.sep).includes('..')) {
          throw new Error(`Path traversal in tarball: ${entryPath}`);
        }
        return true;
      },
      onReadEntry: (entry) => {
        if (entry.type === 'SymbolicLink' || entry.type === 'Link') {
          throw new Error(`Symlink/hardlink in tarball: ${entry.path}`);
        }
      }
    });
  } finally {
    if (fs.existsSync(tmpTarball)) {
      fs.unlinkSync(tmpTarball);
    }
  }
}

export function getExtractDir(projectDir: string, skillName: string): string {
  if (skillName.startsWith('@')) {
    const [scope, name] = skillName.split('/');
    return path.join(projectDir, '.tank', 'skills', scope, name);
  }
  return path.join(projectDir, '.tank', 'skills', skillName);
}

export function getGlobalExtractDir(homedir: string, skillName: string): string {
  const globalDir = path.join(homedir, '.tank', 'skills');
  if (skillName.startsWith('@')) {
    const [scope, name] = skillName.split('/');
    return path.join(globalDir, scope, name);
  }
  return path.join(globalDir, skillName);
}

export function parseLockKey(key: string): string {
  const lastAt = key.lastIndexOf('@');
  if (lastAt <= 0) {
    throw new Error(`Invalid lockfile key: ${key}`);
  }
  return key.slice(0, lastAt);
}

export function parseVersionFromLockKey(key: string): string {
  const lastAt = key.lastIndexOf('@');
  if (lastAt <= 0 || lastAt === key.length - 1) {
    throw new Error(`Invalid lockfile key: ${key}`);
  }
  return key.slice(lastAt + 1);
}

export function getResolvedNodesInOrder(nodes: Map<string, ResolvedNode>, installOrder: string[]): ResolvedNode[] {
  const orderedNodes: ResolvedNode[] = [];
  for (const key of installOrder) {
    const skillName = parseLockKey(key);
    const node = nodes.get(skillName);
    if (!node) {
      throw new Error(`Internal error: missing resolved node for ${key}`);
    }
    orderedNodes.push(node);
  }
  return orderedNodes;
}
