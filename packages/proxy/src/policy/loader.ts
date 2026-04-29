import * as fs from 'node:fs';
import { type PerToolOverride, type ProxyPolicy, proxyPolicySchema } from '@internals/schemas';
import { PHASE_2_DEFAULTS } from './defaults.ts';

export interface LoadPolicyOptions {
  userPolicyPath: string;
  projectPolicyPath: string;
}

export type ResolvedPolicy = ProxyPolicy & {
  perfBudgetMs: number;
  blockOnMatch: boolean;
  resetPinsOnMismatch: boolean;
};

export interface EffectivePerTool {
  scan: boolean;
  blockOnMatch: boolean;
}

function parsePolicyFile(policyPath: string): ProxyPolicy | null {
  if (!fs.existsSync(policyPath)) return null;
  let raw: string;
  try {
    raw = fs.readFileSync(policyPath, 'utf-8');
  } catch {
    return null;
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }
  const result = proxyPolicySchema.safeParse(json);
  return result.success ? result.data : null;
}

function mergePerTool(
  userPerTool: Record<string, PerToolOverride> | undefined,
  projectPerTool: Record<string, PerToolOverride> | undefined
): Record<string, PerToolOverride> | undefined {
  if (!userPerTool && !projectPerTool) return undefined;
  return { ...(userPerTool ?? {}), ...(projectPerTool ?? {}) };
}

function mergePolicies(user: ProxyPolicy | null, project: ProxyPolicy | null): ResolvedPolicy {
  const u = user ?? {};
  const p = project ?? {};
  return {
    perfBudgetMs: p.perfBudgetMs ?? u.perfBudgetMs ?? PHASE_2_DEFAULTS.perfBudgetMs,
    blockOnMatch: p.blockOnMatch ?? u.blockOnMatch ?? PHASE_2_DEFAULTS.blockOnMatch,
    resetPinsOnMismatch: p.resetPinsOnMismatch ?? u.resetPinsOnMismatch ?? PHASE_2_DEFAULTS.resetPinsOnMismatch,
    perTool: mergePerTool(u.perTool, p.perTool)
  };
}

export function loadPolicy(options: LoadPolicyOptions): ResolvedPolicy {
  const user = parsePolicyFile(options.userPolicyPath);
  const project = parsePolicyFile(options.projectPolicyPath);
  return mergePolicies(user, project);
}

export function resolvePerTool(policy: ResolvedPolicy, toolName: string): EffectivePerTool {
  const override = policy.perTool?.[toolName] ?? {};
  return {
    scan: override.scan ?? true,
    blockOnMatch: override.blockOnMatch ?? policy.blockOnMatch
  };
}
