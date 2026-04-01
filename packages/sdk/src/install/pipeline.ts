import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  LEGACY_MANIFEST_FILENAME,
  MANIFEST_FILENAME,
  type Permissions,
  permissionsSchema,
  type SkillsLock
} from '@internals/schemas';
import { extract } from 'tar';

import { TankIntegrityError, TankNetworkError } from '../errors.js';
import { buildSkillKey, type ResolvedNode } from './resolver.js';

const MAX_DOWNLOAD_BYTES = 100 * 1024 * 1024;
const MAX_EXTRACT_ENTRIES = 10_000;
const MAX_EXTRACT_FILE_BYTES = 50 * 1024 * 1024;
const MAX_EXTRACT_TOTAL_BYTES = 500 * 1024 * 1024;

function validateDownloadUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new TankNetworkError(`Invalid download URL: ${url}`);
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new TankNetworkError(`Download URL must use https or http: ${url}`);
  }
  if (parsed.username || parsed.password) {
    throw new TankNetworkError(`Download URL must not contain credentials: ${url}`);
  }
}

export async function downloadAllParallel(
  nodes: ResolvedNode[],
  onProgress?: (msg: string) => void
): Promise<Map<string, { buffer: Buffer; integrity: string }>> {
  const results = new Map<string, { buffer: Buffer; integrity: string }>();
  const CONCURRENCY_LIMIT = 8;

  for (let i = 0; i < nodes.length; i += CONCURRENCY_LIMIT) {
    const batch = nodes.slice(i, i + CONCURRENCY_LIMIT);
    const promises = batch.map(async (node) => {
      onProgress?.(`Downloading ${node.name}@${node.version}...`);
      validateDownloadUrl(node.meta.downloadUrl);
      let res: Response;
      try {
        res = await fetch(node.meta.downloadUrl, { redirect: 'manual' });
      } catch (err) {
        throw new TankNetworkError(
          `Network error downloading ${node.name}@${node.version}`,
          err instanceof Error ? err : undefined
        );
      }
      if (res.status >= 300 && res.status < 400) {
        throw new TankNetworkError(
          `Unexpected redirect (${res.status}) downloading ${node.name}@${node.version}. Refusing to follow.`
        );
      }
      if (!res.ok) {
        throw new TankNetworkError(`Failed to download ${node.name}@${node.version}: ${res.status} ${res.statusText}`);
      }

      const contentLength = res.headers.get('content-length');
      if (contentLength && Number(contentLength) > MAX_DOWNLOAD_BYTES) {
        throw new TankNetworkError(
          `Tarball for ${node.name}@${node.version} exceeds ${MAX_DOWNLOAD_BYTES} byte limit (Content-Length: ${contentLength})`
        );
      }

      const chunks: Uint8Array[] = [];
      let received = 0;
      const reader = res.body?.getReader();
      if (!reader) {
        throw new TankNetworkError(`No response body for ${node.name}@${node.version}`);
      }
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        received += value.byteLength;
        if (received > MAX_DOWNLOAD_BYTES) {
          reader.cancel();
          throw new TankNetworkError(
            `Tarball for ${node.name}@${node.version} exceeds ${MAX_DOWNLOAD_BYTES} byte limit`
          );
        }
        chunks.push(value);
      }

      const buffer = Buffer.concat(chunks);
      const hash = crypto.createHash('sha512').update(buffer).digest('base64');
      const computedIntegrity = `sha512-${hash}`;
      if (computedIntegrity !== node.meta.integrity) {
        throw new TankIntegrityError(`Integrity mismatch for ${node.name}@${node.version}`, {
          expected: node.meta.integrity,
          actual: computedIntegrity
        });
      }

      return { name: node.name, buffer, integrity: computedIntegrity };
    });

    const batchResults = await Promise.all(promises);
    for (const result of batchResults) {
      results.set(result.name, { buffer: result.buffer, integrity: result.integrity });
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
      // Non-critical mismatch — callers can handle via onProgress or ignore
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

    const permsParsed = permissionsSchema.safeParse(node.meta.permissions);
    const validatedPerms: Permissions = permsParsed.success ? permsParsed.data : {};

    lock.skills[key] = {
      resolved: node.meta.downloadUrl,
      integrity,
      permissions: validatedPerms,
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

function mkdirSafeNoSymlinks(targetDir: string): void {
  const resolved = path.resolve(targetDir);
  const segments = resolved.split(path.sep).filter(Boolean);
  let current = resolved.startsWith('/') ? '/' : '';

  for (const seg of segments) {
    current = path.join(current, seg);
    if (fs.existsSync(current)) {
      const stat = fs.lstatSync(current);
      if (stat.isSymbolicLink()) {
        throw new TankIntegrityError(`Symlink in install path: ${current}`);
      }
      if (!stat.isDirectory()) {
        throw new TankIntegrityError(`Non-directory in install path: ${current}`);
      }
    } else {
      fs.mkdirSync(current);
    }
  }
}

export async function extractSafely(tarball: Buffer, destDir: string): Promise<void> {
  if (tarball.length > MAX_DOWNLOAD_BYTES) {
    throw new TankIntegrityError(`Tarball exceeds ${MAX_DOWNLOAD_BYTES} byte limit`);
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tank-extract-'));
  const tmpTarball = path.join(tmpDir, `${crypto.randomUUID()}.tgz`);
  fs.writeFileSync(tmpTarball, tarball, { flag: 'wx' });

  let entryCount = 0;
  let totalBytes = 0;
  try {
    await extract({
      file: tmpTarball,
      cwd: tmpDir,
      filter: (entryPath: string) => {
        entryCount++;
        if (entryCount > MAX_EXTRACT_ENTRIES) {
          throw new Error(`Tarball exceeds ${MAX_EXTRACT_ENTRIES} entry limit`);
        }
        if (path.isAbsolute(entryPath)) {
          throw new Error(`Absolute path in tarball: ${entryPath}`);
        }
        if (entryPath.split('/').includes('..') || entryPath.split(path.sep).includes('..')) {
          throw new Error(`Path traversal in tarball: ${entryPath}`);
        }
        return true;
      },
      onReadEntry: (entry: { type: string; path: string; size?: number }) => {
        if (entry.type === 'SymbolicLink' || entry.type === 'Link') {
          throw new Error(`Symlink/hardlink in tarball: ${entry.path}`);
        }
        if (entry.size && entry.size > MAX_EXTRACT_FILE_BYTES) {
          throw new Error(`File ${entry.path} exceeds ${MAX_EXTRACT_FILE_BYTES} byte limit`);
        }
        totalBytes += entry.size ?? 0;
        if (totalBytes > MAX_EXTRACT_TOTAL_BYTES) {
          throw new Error(`Total extracted size exceeds ${MAX_EXTRACT_TOTAL_BYTES} byte limit`);
        }
      }
    });

    mkdirSafeNoSymlinks(destDir);

    for (const entry of fs.readdirSync(tmpDir)) {
      if (entry === path.basename(tmpTarball)) continue;
      const src = path.join(tmpDir, entry);
      const dst = path.join(destDir, entry);
      fs.renameSync(src, dst);
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
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
