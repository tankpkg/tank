import { inspect } from 'node:util';

/** Format a real Error, surfacing Node errno fields (code/syscall/path) when present. */
function describeErrorObject(err: Error): string {
  const e = err as Error & { code?: unknown; syscall?: unknown; path?: unknown };
  const base = err.message?.trim() || err.name || 'Error';
  const tags = [
    e.code != null ? `code=${String(e.code)}` : null,
    e.syscall != null ? `syscall=${String(e.syscall)}` : null,
    e.path != null ? `path=${String(e.path)}` : null
  ].filter((tag): tag is string => tag !== null);
  return tags.length > 0 ? `${base} (${tags.join(', ')})` : base;
}

/**
 * Render an unknown thrown value as a non-empty, actionable string.
 *
 * Guarantees a useful message for every input: errno errors surface their
 * `code`/`syscall`/`path`, non-Error objects are inspected, and the result
 * never collapses to an empty string or a bare placeholder like `<none>`
 * (the symptom Windows users hit during `tank install`).
 */
export function describeError(err: unknown): string {
  if (err instanceof Error) {
    return describeErrorObject(err);
  }
  if (err === null || err === undefined) {
    return `${String(err)} (non-error thrown)`;
  }
  if (typeof err === 'object') {
    try {
      const name = (err as { constructor?: { name?: string } }).constructor?.name ?? 'object';
      return `${name}: ${inspect(err, { depth: 2 })}`;
    } catch {
      return Object.prototype.toString.call(err);
    }
  }
  return `${typeof err} ${String(err)}`;
}
