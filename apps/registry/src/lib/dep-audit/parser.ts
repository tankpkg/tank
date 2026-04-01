import type { DepEcosystem, Dependency } from './types';

/**
 * Parse dependencies from a skill manifest JSONB object.
 *
 * Handles:
 * - package.json `dependencies` + `devDependencies`
 * - requirements.txt lines embedded in `manifest.files`
 * - Empty manifests → returns []
 */
export function parseDependencies(manifest: Record<string, unknown>): Dependency[] {
  const deps: Dependency[] = [];

  // Extract npm dependencies from package.json-style manifest
  const npmDeps = extractNpmDependencies(manifest);
  deps.push(...npmDeps);

  // Extract Python dependencies from requirements.txt in files list
  const pypiDeps = extractPypiDependencies(manifest);
  deps.push(...pypiDeps);

  // Deduplicate by name+ecosystem (prefer first occurrence)
  const seen = new Set<string>();
  return deps.filter((dep) => {
    const key = `${dep.ecosystem}:${dep.name}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function extractNpmDependencies(manifest: Record<string, unknown>): Dependency[] {
  const deps: Dependency[] = [];

  const depSections = ['dependencies', 'devDependencies'] as const;
  for (const section of depSections) {
    const entries = manifest[section];
    if (!entries || typeof entries !== 'object') continue;

    for (const [name, version] of Object.entries(entries as Record<string, unknown>)) {
      deps.push({
        name,
        version: cleanNpmVersion(version),
        ecosystem: 'npm'
      });
    }
  }

  return deps;
}

function extractPypiDependencies(manifest: Record<string, unknown>): Dependency[] {
  const deps: Dependency[] = [];

  // Check manifest.files for requirements.txt content
  const files = manifest.files;
  if (!files || typeof files !== 'object') return deps;

  const filesObj = files as Record<string, unknown>;
  const reqContent = filesObj['requirements.txt'];
  if (typeof reqContent !== 'string') return deps;

  for (const line of reqContent.split('\n')) {
    const trimmed = line.trim();
    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith('#')) continue;

    const parsed = parseRequirementsLine(trimmed);
    if (parsed) {
      deps.push({
        name: parsed.name,
        version: parsed.version,
        ecosystem: 'pypi'
      });
    }
  }

  return deps;
}

/**
 * Parse a single requirements.txt line.
 * Handles: `package==1.0.0`, `package>=1.0.0`, `package~=1.0`, `package`
 */
function parseRequirementsLine(line: string): { name: string; version: string } | null {
  // Strip environment markers (e.g. "; python_version >= '3.6'")
  const withoutMarkers = line.split(';')[0].trim();

  // Match operators: ==, >=, <=, ~=, !=, >
  const match = withoutMarkers.match(/^([A-Za-z0-9][A-Za-z0-9._-]*)(?:[><=!~]+\s*([0-9][0-9.*]*))?/);
  if (!match) return null;

  const name = match[1];
  const version = match[2] ?? '*';
  return { name, version };
}

/** Strip semver range prefixes (^, ~, >=, etc.) from npm version strings. */
function cleanNpmVersion(version: unknown): string {
  if (typeof version !== 'string') return '*';
  const cleaned = version.replace(/^[\^~>=<]+/, '');
  return cleaned || '*';
}

/** Determine the overall ecosystem from parsed dependencies. */
export function detectEcosystem(deps: Dependency[]): 'npm' | 'pypi' | 'mixed' | 'none' {
  if (deps.length === 0) return 'none';

  const ecosystems = new Set(deps.map((d) => d.ecosystem));
  if (ecosystems.size === 1) {
    return (ecosystems.values().next().value as DepEcosystem) ?? 'none';
  }
  return 'mixed';
}
