import { z } from 'zod';

import { MAX_DESCRIPTION_LENGTH, MAX_NAME_LENGTH } from '~/constants/registry.js';

import { permissionsSchema } from './permissions.js';

const NAME_PATTERN = /^@[a-z0-9-]+\/[a-z0-9][a-z0-9-]*$/;
const SEMVER_PATTERN = /^\d+\.\d+\.\d+(-[a-zA-Z0-9.-]+)?(\+[a-zA-Z0-9.-]+)?$/;

export const skillsJsonSchema = z
  .object({
    name: z
      .string()
      .min(1, 'Name must not be empty')
      .max(MAX_NAME_LENGTH, `Name must be ${MAX_NAME_LENGTH} characters or fewer`)
      .regex(NAME_PATTERN, 'Name must be scoped (@org/name), lowercase alphanumeric and hyphens'),
    version: z.string().regex(SEMVER_PATTERN, 'Version must be valid semver'),
    description: z
      .string()
      .max(MAX_DESCRIPTION_LENGTH, `Description must be ${MAX_DESCRIPTION_LENGTH} characters or fewer`)
      .optional(),
    skills: z.record(z.string(), z.string()).optional(),
    permissions: permissionsSchema.optional(),
    repository: z.string().url('Repository must be a valid URL').optional(),
    visibility: z.enum(['public', 'private']).optional(),
    audit: z
      .object({
        min_score: z.number().min(0).max(10)
      })
      .strict()
      .optional()
  })
  .strict();

export type SkillsJson = z.infer<typeof skillsJsonSchema>;
