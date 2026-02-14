import { z } from 'zod';
import { permissionsSchema } from './permissions.js';

export const lockedSkillSchema = z.object({
  resolved: z.string().url(),
  integrity: z.string().regex(/^sha512-/, 'Integrity must start with sha512-'),
  permissions: permissionsSchema,
  audit_score: z.number().min(0).max(10).nullable(),
});

export const skillsLockSchema = z.object({
  lockfileVersion: z.literal(1),
  skills: z.record(z.string(), lockedSkillSchema),
});

export type LockedSkill = z.infer<typeof lockedSkillSchema>;
export type SkillsLock = z.infer<typeof skillsLockSchema>;
