/**
 * Encode a skill/package name for use in URLs.
 *
 * Like `encodeURIComponent` but keeps `@` and `/` unencoded so scoped
 * package names produce clean, human-readable paths:
 *
 *   encodeSkillName('@tank/bulletproof')  → '@tank/bulletproof'
 *   encodeSkillName('my skill')           → 'my%20skill'
 */
export function encodeSkillName(name: string): string {
  return encodeURIComponent(name)
    .replace(/%40/g, '@')
    .replace(/%2F/gi, '/');
}
