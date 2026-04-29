import { normalizeForScan } from '@internals/helpers';
import type { RegistryEntry } from './shadow-registry.ts';

export interface ToolShape {
  name: string;
  description: string;
}

export type ShadowReason = 'tool_shadow_name_collision' | 'tool_shadow_description_cross_reference';

export interface ShadowFinding {
  offending_server: string;
  offending_tool_name: string;
  shadowed_server: string;
  shadowed_tool_name: string;
  reason: ShadowReason;
}

export interface DetectShadowingInput {
  currentServer: string;
  tools: readonly ToolShape[];
  registry: readonly RegistryEntry[];
}

const WORD_BOUNDARY = /[A-Za-z0-9_]/;

function findWordBoundaryOccurrence(haystack: string, needle: string): boolean {
  if (needle.length === 0 || haystack.length === 0) return false;
  let fromIndex = 0;
  while (true) {
    const idx = haystack.indexOf(needle, fromIndex);
    if (idx === -1) return false;
    const before = idx === 0 ? '' : (haystack[idx - 1] ?? '');
    const afterIdx = idx + needle.length;
    const after = afterIdx >= haystack.length ? '' : (haystack[afterIdx] ?? '');
    if (!WORD_BOUNDARY.test(before) && !WORD_BOUNDARY.test(after)) return true;
    fromIndex = idx + 1;
  }
}

function checkNameCollision(
  tool: ToolShape,
  currentServer: string,
  registry: readonly RegistryEntry[]
): ShadowFinding | null {
  for (const entry of registry) {
    if (entry.server === currentServer) continue;
    if (entry.tool_name === tool.name) {
      return {
        offending_server: currentServer,
        offending_tool_name: tool.name,
        shadowed_server: entry.server,
        shadowed_tool_name: entry.tool_name,
        reason: 'tool_shadow_name_collision'
      };
    }
  }
  return null;
}

function checkDescriptionCrossRef(
  tool: ToolShape,
  currentServer: string,
  registry: readonly RegistryEntry[]
): ShadowFinding | null {
  if (tool.description.length === 0) return null;
  const normalizedDescription = normalizeForScan(tool.description);
  for (const entry of registry) {
    if (entry.server === currentServer) continue;
    if (entry.tool_name.length === 0) continue;
    if (findWordBoundaryOccurrence(normalizedDescription, entry.tool_name)) {
      return {
        offending_server: currentServer,
        offending_tool_name: tool.name,
        shadowed_server: entry.server,
        shadowed_tool_name: entry.tool_name,
        reason: 'tool_shadow_description_cross_reference'
      };
    }
  }
  return null;
}

export function detectShadowing(input: DetectShadowingInput): ShadowFinding[] {
  const findings: ShadowFinding[] = [];
  for (const tool of input.tools) {
    const nameHit = checkNameCollision(tool, input.currentServer, input.registry);
    if (nameHit !== null) {
      findings.push(nameHit);
      continue;
    }
    const descHit = checkDescriptionCrossRef(tool, input.currentServer, input.registry);
    if (descHit !== null) findings.push(descHit);
  }
  return findings;
}
