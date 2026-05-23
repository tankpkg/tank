import { isUrl } from '~/lib/url-fetcher.js';

export type InstallTarget = { kind: 'url'; url: string } | { kind: 'name'; name: string; versionRange?: string };

/**
 * Parse a single install target string into a structured target.
 *
 * Accepted forms (npm-compatible):
 *   - `@org/pkg`               → name with no range
 *   - `@org/pkg@^1.0.0`        → name + range (split on the LAST `@` for scoped names)
 *   - `pkg`                    → unscoped name with no range
 *   - `pkg@1.0.0`              → unscoped name + range
 *   - `https://github.com/...` → URL install
 *
 * The `@` that separates name from range is the FIRST `@` that is NOT at position 0
 * (position 0 is the scope marker for `@org/...`).
 */
export function parseInstallTarget(target: string): InstallTarget {
  if (isUrl(target)) {
    return { kind: 'url', url: target };
  }

  const searchStart = target.startsWith('@') ? 1 : 0;
  const versionAt = target.indexOf('@', searchStart);

  if (versionAt === -1) {
    return { kind: 'name', name: target };
  }

  const name = target.slice(0, versionAt);
  const versionRange = target.slice(versionAt + 1);
  if (!name || !versionRange) {
    return { kind: 'name', name: target };
  }

  return { kind: 'name', name, versionRange };
}

/**
 * Heuristic: does this string look like a bare semver range rather than a skill name?
 * Used to detect the legacy `tank install @org/skill ^1.0.0` positional form so we can
 * preserve back-compat with the previous CLI signature.
 *
 * Returns true for strings like `^1.0.0`, `~1`, `>=2`, `1.x`, `*`, `latest`, `next`, `1.2.3`.
 * Returns false for skill names (contain `/`, start with `@`, or are URLs).
 */
export function looksLikeVersionRange(s: string): boolean {
  if (!s || s.includes('/') || s.startsWith('@') || isUrl(s)) return false;
  if (s === '*' || s === 'latest' || s === 'next') return true;
  if (/^[\^~><=]/.test(s)) return true;
  if (/^\d/.test(s)) return true;
  return false;
}
