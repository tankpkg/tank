import { resolve } from '@internals/helpers';

// ── Types ───────────────────────────────────────────────────────────────────

export type SkillName = string;
export type SemverRange = string;
export type SemverVersion = string;
export type SkillKey = string;

export interface RequirementSource {
  kind: 'root' | 'skill';
  from?: string;
}

export interface Requirement {
  name: SkillName;
  range: SemverRange;
  source: RequirementSource;
}

export interface RegistryVersionInfo {
  version: string;
  integrity: string;
  auditScore: number | null;
  auditStatus: string;
  publishedAt: string;
}

export interface RegistrySkillMeta {
  name: string;
  version: string;
  description?: string;
  integrity: string;
  permissions: Record<string, unknown>;
  auditScore: number | null;
  downloadUrl: string;
  dependencies: Record<string, string>;
}

export interface RegistryFetcher {
  fetchVersions(name: string): Promise<RegistryVersionInfo[]>;
  fetchMetadata(name: string, version: string): Promise<RegistrySkillMeta>;
}

export interface ResolvedNode {
  name: SkillName;
  version: SemverVersion;
  meta: RegistrySkillMeta;
  dependencies: Record<SkillName, SemverVersion>;
}

export interface ResolvedGraph {
  nodes: Map<SkillName, ResolvedNode>;
  installOrder: string[];
}

export interface ConflictError {
  skillName: SkillName;
  requirements: Requirement[];
  availableVersions: string[];
}

// ── Helpers ─────────────────────────────────────────────────────────────────

export function buildSkillKey(name: SkillName, version: SemverVersion): string {
  return `${name}@${version}`;
}

function formatConflictMessage(conflict: ConflictError): string {
  const lines = [`Version conflict for ${conflict.skillName}:`];
  for (const req of conflict.requirements) {
    const origin = req.source.kind === 'root' ? 'root' : (req.source.from ?? 'unknown');
    lines.push(`  - ${req.range} (required by ${origin})`);
  }
  lines.push(`Available versions: ${conflict.availableVersions.join(', ')}`);
  lines.push('No single version satisfies all constraints.');
  return lines.join('\n');
}

// ── Resolution Algorithm ────────────────────────────────────────────────────

export async function resolveDependencyTree(
  rootDependencies: Record<SkillName, SemverRange>,
  fetcher: RegistryFetcher
): Promise<ResolvedGraph> {
  const constraintsByName = new Map<SkillName, Requirement[]>();
  const selectedByName = new Map<SkillName, SemverVersion>();
  const metadataCache = new Map<SkillKey, RegistrySkillMeta>();
  const versionsCache = new Map<SkillName, RegistryVersionInfo[]>();

  // Maps SkillKey → dep names it contributed, so stale requirements
  // can be removed when a selected version changes during fixpoint iteration.
  const contributedDeps = new Map<SkillKey, SkillName[]>();

  const queue = new Set<SkillName>();
  const inProgress = new Set<SkillName>();

  const sortedRootNames = Object.keys(rootDependencies).sort();
  for (const name of sortedRootNames) {
    const range = rootDependencies[name];
    constraintsByName.set(name, [{ name, range, source: { kind: 'root' } }]);
    queue.add(name);
  }

  const MAX_ITERATIONS = 10_000;
  let iterations = 0;
  while (queue.size > 0) {
    if (++iterations > MAX_ITERATIONS) {
      throw new Error(
        `Dependency resolution exceeded ${MAX_ITERATIONS} iterations. This likely indicates a degenerate dependency graph.`
      );
    }
    const sorted = [...queue].sort();
    const name = sorted[0];
    queue.delete(name);

    // Cycle guard: if this name is mid-expansion up the stack, defer —
    // its constraints will be resolved when expansion completes.
    if (inProgress.has(name)) {
      continue;
    }

    const constraints = constraintsByName.get(name);
    if (!constraints || constraints.length === 0) {
      continue;
    }

    let versionInfos = versionsCache.get(name);
    if (!versionInfos) {
      versionInfos = await fetcher.fetchVersions(name);
      versionsCache.set(name, versionInfos);
    }

    const availableVersions = versionInfos.map((v) => v.version).sort();

    const selectedVersion = findSatisfyingVersion(availableVersions, constraints);

    if (selectedVersion === null) {
      const conflict: ConflictError = {
        skillName: name,
        requirements: constraints,
        availableVersions
      };
      throw new Error(formatConflictMessage(conflict));
    }

    const previousVersion = selectedByName.get(name);
    if (previousVersion === selectedVersion) {
      continue;
    }

    inProgress.add(name);

    if (previousVersion !== undefined) {
      const prevKey = buildSkillKey(name, previousVersion);
      const prevDeps = contributedDeps.get(prevKey) ?? [];
      for (const depName of prevDeps) {
        const depConstraints = constraintsByName.get(depName);
        if (depConstraints) {
          const filtered = depConstraints.filter((r) => r.source.from !== prevKey);
          if (filtered.length > 0) {
            constraintsByName.set(depName, filtered);
          } else {
            constraintsByName.delete(depName);
          }
          queue.add(depName);
        }
      }
      contributedDeps.delete(prevKey);
    }

    selectedByName.set(name, selectedVersion);

    const skillKey = buildSkillKey(name, selectedVersion);
    let meta = metadataCache.get(skillKey);
    if (!meta) {
      meta = await fetcher.fetchMetadata(name, selectedVersion);
      metadataCache.set(skillKey, meta);
    }

    const depNames: SkillName[] = [];
    const sortedDepEntries = Object.entries(meta.dependencies).sort(([a], [b]) => a.localeCompare(b));

    for (const [depName, depRange] of sortedDepEntries) {
      depNames.push(depName);

      const requirement: Requirement = {
        name: depName,
        range: depRange,
        source: { kind: 'skill', from: skillKey }
      };

      const existing = constraintsByName.get(depName) ?? [];
      existing.push(requirement);
      constraintsByName.set(depName, existing);

      queue.add(depName);
    }

    contributedDeps.set(skillKey, depNames);
    inProgress.delete(name);
  }

  for (const [name] of selectedByName) {
    const constraints = constraintsByName.get(name);
    if (!constraints || constraints.length === 0) {
      selectedByName.delete(name);
    }
  }

  return buildGraph(selectedByName, metadataCache);
}

// ── Version Selection ───────────────────────────────────────────────────────

function findSatisfyingVersion(availableVersions: string[], constraints: Requirement[]): string | null {
  const ranges = [...new Set(constraints.map((c) => c.range))];

  const satisfyingSets = ranges.map((range) => {
    const matching = new Set<string>();
    for (const v of availableVersions) {
      if (resolve(range, [v]) !== null) {
        matching.add(v);
      }
    }
    return matching;
  });

  if (satisfyingSets.length === 0) {
    return null;
  }

  let intersection = satisfyingSets[0];
  for (let i = 1; i < satisfyingSets.length; i++) {
    intersection = new Set([...intersection].filter((v) => satisfyingSets[i].has(v)));
  }

  if (intersection.size === 0) {
    return null;
  }

  const candidates = [...intersection];
  return resolve('*', candidates);
}

// ── Graph Construction ──────────────────────────────────────────────────────

function buildGraph(
  selectedByName: Map<SkillName, SemverVersion>,
  metadataCache: Map<SkillKey, RegistrySkillMeta>
): ResolvedGraph {
  const nodes = new Map<SkillName, ResolvedNode>();
  const installOrder: string[] = [];

  const sortedEntries = [...selectedByName.entries()].sort(([a], [b]) => a.localeCompare(b));

  for (const [name, version] of sortedEntries) {
    const skillKey = buildSkillKey(name, version);
    const meta = metadataCache.get(skillKey);

    if (!meta) {
      throw new Error(`Internal error: missing metadata for ${skillKey}`);
    }

    const resolvedDeps: Record<SkillName, SemverVersion> = {};
    const sortedDepNames = Object.keys(meta.dependencies).sort();
    for (const depName of sortedDepNames) {
      const depVersion = selectedByName.get(depName);
      if (depVersion !== undefined) {
        resolvedDeps[depName] = depVersion;
      }
    }

    nodes.set(name, {
      name,
      version,
      meta,
      dependencies: resolvedDeps
    });

    installOrder.push(skillKey);
  }

  return { nodes, installOrder };
}
