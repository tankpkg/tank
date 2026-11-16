import fs from 'node:fs';
import path from 'node:path';

import {
  isLocalLinkLockEntry,
  LOCAL_LINK_PREFIX,
  type LockedSkill,
  MANIFEST_FILENAME,
  type Permissions,
  publishManifestSchema,
  type SkillsLock
} from '@internals/schemas';
import { z } from 'zod';

import type { RegistryFetcher, RegistrySkillMeta, RegistryVersionInfo } from '~/lib/dependency-resolver.js';
import { parseLockKey } from '~/lib/install-pipeline.js';
import { readJsonFile, resolveManifestPath } from '~/lib/manifest.js';

/**
 * Project-local skills: `"@acme/x": "link:./skills/x"` in the root tank.json.
 * They are linked from their folder, never downloaded, never uploaded.
 * Their registry dependencies are resolved like any other root dependency.
 */
export interface LocalSkill {
  name: string;
  version: string;
  description?: string;
  /** Normalized spec, POSIX separators: `link:./skills/x`. Stable across machines. */
  spec: string;
  /** Absolute, symlink-resolved folder that holds SKILL.md and tank.json. */
  dir: string;
  permissions: Permissions;
  /** Registry dependencies as declared (name -> semver range). */
  dependencies: Record<string, string>;
  /** Declares an `mcp_server`. Never auto-registered for local skills (they are not scanned). */
  hasMcpServer: boolean;
}

export interface SkillSpecs {
  /** name -> semver range, resolved through the registry. */
  registry: Record<string, string>;
  /** name -> `link:` spec, linked from the project. */
  local: Record<string, string>;
}

interface LinkTarget {
  dir: string;
  spec: string;
}

const manifestFields = publishManifestSchema.shape;

/** What a local skill's own tank.json must provide. Other fields are allowed and ignored. */
const localManifestSchema = z.looseObject({
  name: manifestFields.name,
  version: manifestFields.version,
  description: manifestFields.description,
  skills: manifestFields.skills,
  permissions: manifestFields.permissions,
  mcp_server: manifestFields.mcp_server
});

type LocalManifest = z.infer<typeof localManifestSchema>;

export function isLinkSpec(spec: string | undefined): boolean {
  return spec?.startsWith(LOCAL_LINK_PREFIX) === true;
}

/** Split a manifest `skills` map into registry ranges and local `link:` specs. */
export function splitSkillSpecs(skills: Record<string, string>): SkillSpecs {
  const specs: SkillSpecs = { registry: {}, local: {} };
  for (const [name, spec] of Object.entries(skills)) {
    const bucket = isLinkSpec(spec) ? specs.local : specs.registry;
    bucket[name] = spec;
  }
  return specs;
}

function isStrictlyInside(root: string, candidate: string): boolean {
  const rel = path.relative(root, candidate);
  const escapes = rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel);
  return rel !== '' && !escapes;
}

function toPosixSpec(root: string, absolute: string): string {
  return `${LOCAL_LINK_PREFIX}./${path.relative(root, absolute).split(path.sep).join('/')}`;
}

function isDirectory(candidate: string): boolean {
  return fs.existsSync(candidate) && fs.statSync(candidate).isDirectory();
}

/**
 * Resolve a `link:` spec to a folder strictly inside the project root.
 * Rejects absolute paths, `..` escapes and symlinks that point outside the root.
 */
export function resolveLinkSpec(name: string, spec: string, projectRoot: string): LinkTarget {
  const relPath = spec.slice(LOCAL_LINK_PREFIX.length).trim();
  if (relPath === '' || path.isAbsolute(relPath) || path.win32.isAbsolute(relPath)) {
    throw new Error(`${name}: "${spec}" must be a relative path inside the project`);
  }
  const root = fs.realpathSync(projectRoot);
  const absolute = path.resolve(root, relPath);
  if (!isStrictlyInside(root, absolute)) {
    throw new Error(`${name}: "${spec}" points outside the project root`);
  }
  if (!isDirectory(absolute)) {
    throw new Error(`${name}: "${spec}" is not a folder (${absolute})`);
  }
  const real = fs.realpathSync(absolute);
  if (!isStrictlyInside(root, real)) {
    throw new Error(`${name}: "${spec}" resolves through a symlink to outside the project root`);
  }
  return { dir: real, spec: toPosixSpec(root, absolute) };
}

function readLocalManifest(name: string, target: LinkTarget): LocalManifest {
  const manifestPath = resolveManifestPath(target.dir);
  if (!manifestPath.exists) {
    throw new Error(`${name}: no ${MANIFEST_FILENAME} in ${target.spec}`);
  }
  try {
    return readJsonFile(manifestPath.path, localManifestSchema);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(`${name} (${target.spec}): ${reason}`);
  }
}

/**
 * Security guard: only the root manifest may declare `link:` specs. A local skill or a
 * registry package declaring one could otherwise pull arbitrary project folders into the graph.
 */
export function assertNoLinkDependencies(owner: string, skills: Record<string, string>): void {
  const nested = Object.keys(splitSkillSpecs(skills).local);
  if (nested.length === 0) return;
  throw new Error(
    `${owner} declares "${LOCAL_LINK_PREFIX}" dependencies (${nested.join(', ')}). ` +
      `List local skills in the root ${MANIFEST_FILENAME} and depend on them by version range.`
  );
}

function assertNameMatches(name: string, target: LinkTarget, manifest: LocalManifest): void {
  if (manifest.name === name) return;
  throw new Error(
    `Local skill name mismatch: ${MANIFEST_FILENAME} lists "${name}" at ${target.spec}, ` +
      `but ${target.spec}/${MANIFEST_FILENAME} declares "${manifest.name}"`
  );
}

function toLocalSkill(target: LinkTarget, manifest: LocalManifest): LocalSkill {
  const dependencies = manifest.skills ?? {};
  assertNoLinkDependencies(manifest.name, dependencies);
  const local: LocalSkill = {
    name: manifest.name,
    version: manifest.version,
    spec: target.spec,
    dir: target.dir,
    permissions: manifest.permissions ?? {},
    dependencies,
    hasMcpServer: manifest.mcp_server !== undefined
  };
  if (manifest.description !== undefined) local.description = manifest.description;
  return local;
}

/** Read and validate one local skill. Throws on path escape, missing files, invalid manifest or a name mismatch. */
export function readLocalSkill(name: string, spec: string, projectRoot: string): LocalSkill {
  const target = resolveLinkSpec(name, spec, projectRoot);
  if (!fs.existsSync(path.join(target.dir, 'SKILL.md'))) {
    throw new Error(`${name}: no SKILL.md in ${target.spec}`);
  }
  const manifest = readLocalManifest(name, target);
  assertNameMatches(name, target, manifest);
  return toLocalSkill(target, manifest);
}

/** Read every `link:` entry. All are validated before the caller links or downloads anything. */
export function readLocalSkills(localSpecs: Record<string, string>, projectRoot: string): LocalSkill[] {
  return Object.entries(localSpecs)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, spec]) => readLocalSkill(name, spec, projectRoot));
}

/**
 * Placeholder registry metadata so the resolver can treat a local skill as a graph node.
 * `integrity`/`downloadUrl` are empty: local nodes must never reach download or the
 * registry lockfile writer — install partitions them out once (see `partitionLocalNodes`).
 */
export function localSkillToMeta(local: LocalSkill): RegistrySkillMeta {
  const meta: RegistrySkillMeta = {
    name: local.name,
    version: local.version,
    integrity: '',
    permissions: local.permissions,
    auditScore: null,
    downloadUrl: '',
    dependencies: local.dependencies
  };
  if (local.description !== undefined) {
    meta.description = local.description;
  }
  return meta;
}

function localVersionInfo(local: LocalSkill): RegistryVersionInfo {
  return { version: local.version, integrity: '', auditScore: null, auditStatus: 'local', publishedAt: '' };
}

/**
 * Wrap the registry fetcher so local skills resolve from disk. The resolver then
 * treats each local skill as a node whose registry deps get normal semver
 * resolution and conflict detection — and never asks the registry about it.
 */
export function createLocalAwareFetcher(base: RegistryFetcher, localSkills: LocalSkill[]): RegistryFetcher {
  const byName = new Map(localSkills.map((local) => [local.name, local]));
  return {
    async fetchVersions(name: string): Promise<RegistryVersionInfo[]> {
      const local = byName.get(name);
      return local ? [localVersionInfo(local)] : base.fetchVersions(name);
    },
    async fetchMetadata(name: string, version: string): Promise<RegistrySkillMeta> {
      const local = byName.get(name);
      if (local) return localSkillToMeta(local);
      const meta = await base.fetchMetadata(name, version);
      assertNoLinkDependencies(`${name}@${version}`, meta.dependencies);
      return meta;
    }
  };
}

/** Root dependencies for the resolver: each local skill pinned to its own version. */
export function localRootDependencies(localSkills: LocalSkill[]): Record<string, string> {
  const roots: Record<string, string> = {};
  for (const local of localSkills) {
    roots[local.name] = local.version;
  }
  return roots;
}

function sortRecord<T>(record: Record<string, T>): Record<string, T> {
  const sorted: Record<string, T> = {};
  for (const key of Object.keys(record).sort()) {
    sorted[key] = record[key];
  }
  return sorted;
}

export function buildLocalLockEntry(local: LocalSkill): LockedSkill {
  return {
    source: 'local',
    resolved: local.spec,
    integrity: null,
    permissions: local.permissions,
    audit_score: null,
    dependencies: sortRecord(local.dependencies)
  };
}

/** Replace every lock entry for each local skill with a fresh local entry, then sort keys. */
export function mergeLocalLockEntries(lock: SkillsLock, localSkills: LocalSkill[]): SkillsLock {
  const localNames = new Set(localSkills.map((local) => local.name));
  const merged: Record<string, LockedSkill> = {};
  for (const [key, entry] of Object.entries(lock.skills)) {
    if (!localNames.has(parseLockKey(key))) merged[key] = entry;
  }
  for (const local of localSkills) {
    merged[`${local.name}@${local.version}`] = buildLocalLockEntry(local);
  }
  lock.skills = sortRecord(merged);
  return lock;
}

/**
 * Remove local lock entries whose name is no longer a `link:` spec in tank.json
 * (e.g. the skill was published and now comes from the registry). Returns the removed keys.
 */
export function dropStaleLocalEntries(lock: SkillsLock, localSpecs: Record<string, string>): string[] {
  const stale = Object.entries(lock.skills)
    .filter(([key, entry]) => isLocalLinkLockEntry(entry) && localSpecs[parseLockKey(key)] === undefined)
    .map(([key]) => key);
  for (const key of stale) delete lock.skills[key];
  return stale;
}

function sortedUnique(values: readonly string[] | undefined): string[] {
  return [...new Set(values ?? [])].sort();
}

/** Order-insensitive fingerprint: `subprocess: false` and an absent field mean the same thing. */
function permissionsFingerprint(permissions: Permissions): string {
  return JSON.stringify([
    sortedUnique(permissions.network?.outbound),
    sortedUnique(permissions.filesystem?.read),
    sortedUnique(permissions.filesystem?.write),
    permissions.subprocess === true
  ]);
}

function dependenciesFingerprint(dependencies: Record<string, string>): string {
  return JSON.stringify(Object.entries(sortRecord(dependencies)));
}

/** Fields that differ between a lock entry and the local skill on disk. Empty when in sync. */
export function diffLocalLockEntry(lockVersion: string, entry: LockedSkill, local: LocalSkill): string[] {
  const changed: string[] = [];
  if (lockVersion !== local.version) changed.push(`version ${lockVersion} → ${local.version}`);
  if (entry.resolved !== local.spec) changed.push(`path ${entry.resolved} → ${local.spec}`);
  if (permissionsFingerprint(entry.permissions) !== permissionsFingerprint(local.permissions)) {
    changed.push('permissions');
  }
  if (dependenciesFingerprint(entry.dependencies ?? {}) !== dependenciesFingerprint(local.dependencies)) {
    changed.push('dependencies');
  }
  return changed;
}
