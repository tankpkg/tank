import { z } from 'zod';
import { permissionsSchema } from './permissions.js';

// ── v1 (legacy, read-only) ──────────────────────────────────────────────────

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

// ── v2 (current) ────────────────────────────────────────────────────────────
// Adds `dependencies` to each locked entry: resolved dep name → version.
// Enables full dependency tree reconstruction from the lockfile alone.

export const lockedSkillSchema = z.object({
  resolved: z.string().url(),
  integrity: z.string().regex(/^sha512-/, 'Integrity must start with sha512-'),
  permissions: permissionsSchema,
  audit_score: z.number().min(0).max(10).nullable(),
  /** Resolved dependency edges: skill name → resolved version. */
  dependencies: z.record(z.string(), z.string()).optional()
});

export const skillsLockSchema = z.object({
  lockfileVersion: z.union([z.literal(1), z.literal(2)]),
  skills: z.record(z.string(), lockedSkillSchema)
});

export type LockedSkillV1 = z.infer<typeof lockedSkillV1Schema>;
export type LockedSkill = z.infer<typeof lockedSkillSchema>;
export type SkillsLock = z.infer<typeof skillsLockSchema>;
