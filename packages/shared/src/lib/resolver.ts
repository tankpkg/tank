import semver from 'semver';

/**
 * Resolves a semver range against a list of available versions.
 * Returns the highest version that satisfies the range, or null if none match.
 *
 * Pre-release versions are excluded from range matching unless the range
 * explicitly includes a pre-release tag (e.g., ">=1.0.0-beta.1").
 * Exact version matches always work, including for pre-release versions.
 *
 * @param range - A semver range string (e.g., "^2.1.0", "~1.0.0", ">=2.0.0 <3.0.0", "*")
 * @param versions - An array of semver version strings to match against
 * @returns The highest matching version string, or null if no match
 */
export function resolve(range: string, versions: string[]): string | null {
  try {
    // Validate the range — semver.validRange returns null for invalid ranges
    if (!range || !semver.validRange(range)) {
      return null;
    }

    // Filter out invalid version strings
    const validVersions = versions.filter((v) => semver.valid(v) !== null);

    if (validVersions.length === 0) {
      return null;
    }

    // Use semver.maxSatisfying to find the highest matching version.
    // By default, semver excludes pre-release versions from range matching
    // unless the range itself contains a pre-release tag.
    const result = semver.maxSatisfying(validVersions, range);

    return result ?? null;
  } catch {
    // Don't throw on any semver parsing errors — return null
    return null;
  }
}

/**
 * Sorts an array of semver version strings in descending order (newest first).
 * Invalid version strings are filtered out.
 * Does not mutate the original array.
 *
 * @param versions - An array of semver version strings
 * @returns A new array sorted descending by semver precedence
 */
export function sortVersions(versions: string[]): string[] {
  const validVersions = versions.filter((v) => semver.valid(v) !== null);
  return [...validVersions].sort((a, b) => semver.rcompare(a, b));
}
