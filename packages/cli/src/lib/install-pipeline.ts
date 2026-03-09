import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Permissions, SkillsLock } from '@internal/shared';
import type ora from 'ora';
import { extract } from 'tar';
import { buildSkillKey, type ResolvedNode } from './dependency-resolver.js';
import { logger } from './logger.js';

export async function downloadAllParallel(
  nodes: ResolvedNode[],
  spinner: ReturnType<typeof ora>
): Promise<Map<string, { buffer: Buffer; integrity: string }>> {
  const results = new Map<string, { buffer: Buffer; integrity: string }>();
  const CONCURRENCY_LIMIT = 8;

  for (let i = 0; i < nodes.length; i += CONCURRENCY_LIMIT) {
    const batch = nodes.slice(i, i + CONCURRENCY_LIMIT);
    const promises = batch.map(async (node) => {
      spinner.text = `Downloading ${node.name}@${node.version}...`;
      let res: Response;
      try {
        res = await fetch(node.meta.downloadUrl);
      } catch (err) {
        throw new Error(
          `Network error downloading tarball for ${node.name}@${node.version}: ${err instanceof Error ? err.message : String(err)}`
        );
      }
      if (!res.ok) {
        throw new Error(`Failed to download ${node.name}@${node.version}: ${res.status} ${res.statusText}`);
      }

      const buffer = Buffer.from(await res.arrayBuffer());
      const hash = crypto.createHash('sha512').update(buffer).digest('base64');
      const computedIntegrity = `sha512-${hash}`;
      if (computedIntegrity !== node.meta.integrity) {
        throw new Error(
          `Integrity mismatch for ${node.name}@${node.version}. Expected: ${node.meta.integrity}, Got: ${computedIntegrity}`
        );
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
  const extractedManifestPath = path.join(extractDir, 'skills.json');
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
  const extractedManifestPath = path.join(extractDir, 'skills.json');
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
