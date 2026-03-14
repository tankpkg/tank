import semver from 'semver';

export function resolve(range: string, versions: string[]): string | null {
  try {
    if (!range || !semver.validRange(range)) {
      return null;
    }

    const validVersions = versions.filter((v) => semver.valid(v) !== null);

    if (validVersions.length === 0) {
      return null;
    }

    const result = semver.maxSatisfying(validVersions, range);

    return result ?? null;
  } catch {
    return null;
  }
}

export function sortVersions(versions: string[]): string[] {
  const validVersions = versions.filter((v) => semver.valid(v) !== null);
  return [...validVersions].sort((a, b) => semver.rcompare(a, b));
}
