import { z } from 'zod';

import { permissionsSchema } from './permissions.js';

export const SKILL_SOURCES = ['registry', 'github', 'clawhub', 'skills_sh', 'agentskills_il', 'npm', 'local'] as const;
export type SkillSource = (typeof SKILL_SOURCES)[number];

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

export const lockedSkillSchema = z.object({
  resolved: z.string().url(),
  integrity: z.string().regex(/^sha512-/, 'Integrity must start with sha512-'),
  permissions: permissionsSchema,
  audit_score: z.number().min(0).max(10).nullable(),
  dependencies: z.record(z.string(), z.string()).optional(),
  source: z.enum(SKILL_SOURCES).optional(),
  scan_verdict: z.enum(SCAN_VERDICTS).optional(),
  scanned_at: z.string().optional()
});

export const skillsLockSchema = z.object({
  lockfileVersion: z.union([z.literal(1), z.literal(2)]),
  skills: z.record(z.string(), lockedSkillSchema)
});

export type LockedSkillV1 = z.infer<typeof lockedSkillV1Schema>;
export type LockedSkill = z.infer<typeof lockedSkillSchema>;
export type SkillsLock = z.infer<typeof skillsLockSchema>;
