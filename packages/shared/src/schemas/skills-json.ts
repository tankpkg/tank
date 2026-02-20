import { z } from 'zod';
import { permissionsSchema } from './permissions.js';

const NAME_PATTERN = /^(@[a-z0-9-]+\/)?[a-z0-9-]+$/;
const SEMVER_PATTERN = /^\d+\.\d+\.\d+(-[a-zA-Z0-9.-]+)?(\+[a-zA-Z0-9.-]+)?$/;

export const skillsJsonSchema = z.object({
  name: z.string()
    .min(1, 'Name must not be empty')
    .max(214, 'Name must be 214 characters or fewer')
    .regex(NAME_PATTERN, 'Name must be lowercase, optionally scoped (@org/name)'),
  version: z.string()
    .regex(SEMVER_PATTERN, 'Version must be valid semver'),
  description: z.string()
    .max(500, 'Description must be 500 characters or fewer')
    .optional(),
  skills: z.record(z.string(), z.string()).optional(),
  permissions: permissionsSchema.optional(),
  repository: z.string().url('Repository must be a valid URL').optional(),
  audit: z.object({
    min_score: z.number().min(0).max(10),
  }).strict().optional(),
}).strict();

export type SkillsJson = z.infer<typeof skillsJsonSchema>;
