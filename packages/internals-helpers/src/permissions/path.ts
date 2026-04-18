export function isPathAllowed(requestedPath: string, allowedPaths: string[]): boolean {
  const norm = (p: string) => p.replaceAll('\\', '/');
  const req = norm(requestedPath);

  if (req.includes('..')) return false;

  for (const allowed of allowedPaths) {
    const a = norm(allowed);
    if (a === req) return true;
    if (a.endsWith('/**')) {
      const prefix = a.slice(0, -3);
      if (req === prefix || req.startsWith(`${prefix}/`)) return true;
    }
  }
  return false;
}
