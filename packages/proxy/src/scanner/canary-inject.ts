const META_KEY = '_meta';
const CANARY_KEY = 'tank_canary';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function buildMeta(existing: unknown, canary: string): Record<string, unknown> {
  if (!isPlainObject(existing)) return { [CANARY_KEY]: canary };
  return { ...existing, [CANARY_KEY]: canary };
}

export function injectCanary(args: unknown, canary: string): unknown {
  if (!isPlainObject(args)) {
    return { [META_KEY]: { [CANARY_KEY]: canary } };
  }
  const { [META_KEY]: existingMeta, ...rest } = args;
  return { ...rest, [META_KEY]: buildMeta(existingMeta, canary) };
}
