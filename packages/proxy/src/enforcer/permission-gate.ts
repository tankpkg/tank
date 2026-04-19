import { isDomainAllowed, isPathAllowedWithRealpath } from '@internals/helpers';
import { extractPathReferences, extractUrlReferences } from './arg-extractors.ts';
import type { EnforcementBudget } from './manifest-loader.ts';

export interface ToolCall {
  toolName: string;
  arguments: unknown;
}

export type Verdict = 'allow' | 'block';

export interface Violation {
  type: 'domain_not_allowed' | 'path_not_allowed';
  value: string;
}

export interface GateResult {
  verdict: Verdict;
  warnNoBudget: boolean;
  violation: Violation | null;
}

function firstDisallowedUrl(call: ToolCall, allowedDomains: readonly string[]): Violation | null {
  const refs = extractUrlReferences(call.arguments);
  for (const ref of refs) {
    if (!isDomainAllowed(ref.hostname, [...allowedDomains])) {
      return { type: 'domain_not_allowed', value: ref.hostname };
    }
  }
  return null;
}

async function firstDisallowedPath(call: ToolCall, allowedPaths: readonly string[]): Promise<Violation | null> {
  const paths = extractPathReferences(call.arguments);
  for (const p of paths) {
    const allowed = await isPathAllowedWithRealpath(p, [...allowedPaths]);
    if (!allowed) {
      return { type: 'path_not_allowed', value: p };
    }
  }
  return null;
}

export async function evaluatePermissionGate(call: ToolCall, budget: EnforcementBudget | null): Promise<GateResult> {
  if (budget === null) {
    return { verdict: 'allow', warnNoBudget: true, violation: null };
  }

  const allowedDomains = budget.network?.outbound ?? [];
  const urlViolation = firstDisallowedUrl(call, allowedDomains);
  if (urlViolation) {
    return { verdict: 'block', warnNoBudget: false, violation: urlViolation };
  }

  const allowedPaths = [...(budget.filesystem?.read ?? []), ...(budget.filesystem?.write ?? [])];
  const pathViolation = await firstDisallowedPath(call, allowedPaths);
  if (pathViolation) {
    return { verdict: 'block', warnNoBudget: false, violation: pathViolation };
  }

  return { verdict: 'allow', warnNoBudget: false, violation: null };
}
