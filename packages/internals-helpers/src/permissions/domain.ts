export function isDomainAllowed(domain: string, allowedDomains: string[]): boolean {
  for (const allowed of allowedDomains) {
    if (allowed === domain) return true;
    if (allowed.startsWith('*.')) {
      const suffix = allowed.slice(1);
      if (domain.endsWith(suffix) || domain === allowed.slice(2)) {
        return true;
      }
      if (domain === allowed) return true;
    }
  }
  return false;
}
