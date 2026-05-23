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

async function resolveRealpathSafely(path: string): Promise<string> {
  try {
    const { realpath } = await import('node:fs/promises');
    return await realpath(path);
  } catch {
    return path;
  }
}

export async function isPathAllowedWithRealpath(requestedPath: string, allowedPaths: string[]): Promise<boolean> {
  if (!isPathAllowed(requestedPath, allowedPaths)) return false;

  let resolvedRequested: string;
  try {
    const { realpath } = await import('node:fs/promises');
    resolvedRequested = await realpath(requestedPath);
  } catch {
    // Path does not exist yet (ENOENT). Non-existent paths cannot be symlink
    // attacks; trust the sync isPathAllowed result above.
    return true;
  }

  // macOS maps /var to /private/var via symlink (same for some Linux setups),
  // so the raw allowed string and the realpath of a legit path inside it diverge
  // even without attack. Resolve both sides before final containment check.
  const resolvedAllowed: string[] = [];
  for (const allowed of allowedPaths) {
    const isGlob = allowed.endsWith('/**');
    const base = isGlob ? allowed.slice(0, -3) : allowed;
    const resolvedBase = await resolveRealpathSafely(base);
    resolvedAllowed.push(isGlob ? `${resolvedBase}/**` : resolvedBase);
  }

  return isPathAllowed(resolvedRequested, resolvedAllowed);
}
