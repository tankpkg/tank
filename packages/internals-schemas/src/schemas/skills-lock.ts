import { z } from 'zod';

import { permissionsReadSchema, permissionsSchema } from './permissions.js';

export const SKILL_SOURCES = ['registry', 'github', 'clawhub', 'skills_sh', 'agentskills_il', 'npm', 'local'] as const;
export type SkillSource = (typeof SKILL_SOURCES)[number];

/**
 * Spec prefix for a skill that lives in the project itself (e.g. `"@acme/x": "link:./skills/x"`).
 * Lockfile entries for these have `source: "local"`, `resolved: "link:..."` and `integrity: null`.
 */
export const LOCAL_LINK_PREFIX = 'link:';

/** True for a project-local `link:` lock entry — the only kind allowed a null integrity. */
export function isLocalLinkLockEntry(entry: { source?: SkillSource; resolved: string }): boolean {
  return entry.source === 'local' && entry.resolved.startsWith(LOCAL_LINK_PREFIX);
}

export const SCAN_VERDICTS = ['pass', 'pass_with_notes', 'flagged', 'fail', 'error'] as const;
export type ScanVerdict = (typeof SCAN_VERDICTS)[number];

export const lockedSkillV1Schema = z.object({
  resolved: z.string().url(),
  integrity: z.string().regex(/^sha512-/, 'Integrity must start with sha512-'),
  permissions: permissionsSchema,
  audit_score: z.number().min(0).max(10).nullable()
});

export const skillsLockV1Schema = z.object({
  lockfileVersion: z.literal(1),
  skills: z.record(z.string(), lockedSkillV1Schema)
});

export const lockedSkillSchema = z
  .object({
    resolved: z.string().url(),
    // null only for project-local `link:` entries: their content lives in the same repo and has no tarball.
    integrity: z
      .string()
      .regex(/^sha512-/, 'Integrity must start with sha512-')
      .nullable(),
    permissions: permissionsSchema,
    audit_score: z.number().min(0).max(10).nullable(),
    dependencies: z.record(z.string(), z.string()).optional(),
    source: z.enum(SKILL_SOURCES).optional(),
    scan_verdict: z.enum(SCAN_VERDICTS).optional(),
    scanned_at: z.string().optional()
  })
  .superRefine(refineNullIntegrity);

function refineNullIntegrity(
  entry: { integrity: string | null; source?: SkillSource; resolved: string },
  ctx: z.RefinementCtx
): void {
  if (entry.integrity === null && !isLocalLinkLockEntry(entry)) {
    ctx.addIssue({
      code: 'custom',
      path: ['integrity'],
      message: `Integrity may only be null for source "local" entries resolved via ${LOCAL_LINK_PREFIX}`
    });
  }
}

export const skillsLockSchema = z.object({
  lockfileVersion: z.union([z.literal(1), z.literal(2)]),
  skills: z.record(z.string(), lockedSkillSchema)
});

/**
 * Read-side lock entry for lockfiles users already have. Older writers (pre-0.17 CLI URL
 * installs, the MCP install/update tools) copied registry permissions verbatim and could
 * omit `audit_score`. Types are still checked and the null-integrity rule still holds;
 * unknown keys pass through so a rewrite preserves them.
 */
const lockedSkillReadSchema = z
  .looseObject({
    resolved: z.string().min(1),
    integrity: z.string().min(1).nullable(),
    permissions: permissionsReadSchema,
    audit_score: z
      .number()
      .nullable()
      .optional()
      .transform((score) => score ?? null),
    dependencies: z.record(z.string(), z.string()).optional(),
    source: z.enum(SKILL_SOURCES).optional(),
    scan_verdict: z.enum(SCAN_VERDICTS).optional(),
    scanned_at: z.string().optional()
  })
  .superRefine(refineNullIntegrity);

export const skillsLockReadSchema = z.object({
  lockfileVersion: z.union([z.literal(1), z.literal(2)]),
  skills: z.record(z.string(), lockedSkillReadSchema)
});

export type LockedSkillV1 = z.infer<typeof lockedSkillV1Schema>;
export type LockedSkill = z.infer<typeof lockedSkillSchema>;
export type SkillsLock = z.infer<typeof skillsLockSchema>;
