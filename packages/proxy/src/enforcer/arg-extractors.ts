export const MAX_TRAVERSAL_DEPTH = 16;

const PATH_FIELD_NAMES: ReadonlySet<string> = new Set(['path', 'file', 'filename', 'directory', 'dir']);

export interface UrlReference {
  url: string;
  hostname: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseUrlSafely(value: string): UrlReference | null {
  if (!value.startsWith('http://') && !value.startsWith('https://')) return null;
  try {
    const parsed = new URL(value);
    if (parsed.hostname === '') return null;
    return { url: value, hostname: parsed.hostname };
  } catch {
    return null;
  }
}

function walkForUrls(value: unknown, depth: number, seen: WeakSet<object>, out: UrlReference[]): void {
  if (depth >= MAX_TRAVERSAL_DEPTH) return;
  if (typeof value === 'string') {
    const ref = parseUrlSafely(value);
    if (ref) out.push(ref);
    return;
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) return;
    seen.add(value);
    for (const item of value) walkForUrls(item, depth + 1, seen, out);
    return;
  }
  if (isRecord(value)) {
    if (seen.has(value)) return;
    seen.add(value);
    for (const child of Object.values(value)) walkForUrls(child, depth + 1, seen, out);
  }
}

export function extractUrlReferences(args: unknown): UrlReference[] {
  const out: UrlReference[] = [];
  walkForUrls(args, 0, new WeakSet(), out);
  return out;
}

function walkForPaths(value: unknown, depth: number, seen: WeakSet<object>, out: string[]): void {
  if (depth >= MAX_TRAVERSAL_DEPTH) return;
  if (Array.isArray(value)) {
    if (seen.has(value)) return;
    seen.add(value);
    for (const item of value) walkForPaths(item, depth + 1, seen, out);
    return;
  }
  if (!isRecord(value)) return;
  if (seen.has(value)) return;
  seen.add(value);
  for (const [key, child] of Object.entries(value)) {
    if (PATH_FIELD_NAMES.has(key) && typeof child === 'string') {
      out.push(child);
      continue;
    }
    walkForPaths(child, depth + 1, seen, out);
  }
}

export function extractPathReferences(args: unknown): string[] {
  const out: string[] = [];
  walkForPaths(args, 0, new WeakSet(), out);
  return out;
}
