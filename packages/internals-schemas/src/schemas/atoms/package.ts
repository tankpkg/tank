import { z } from 'zod';

import { MAX_DESCRIPTION_LENGTH, MAX_NAME_LENGTH } from '~/constants/registry.js';
import { permissionsSchema } from '~/schemas/permissions.js';

import { agentIRSchema } from './agent.js';
import { hookIRSchema } from './hook.js';
import { instructionIRSchema } from './instruction.js';
import { promptIRSchema } from './prompt.js';
import { resourceIRSchema } from './resource.js';
import { ruleIRSchema } from './rule.js';
import { toolIRSchema } from './tool.js';
import { publishConfigSchema } from '../skills-json.js';

const NAME_PATTERN = /^@[a-z0-9-]+\/[a-z0-9][a-z0-9-]*$/;
const SEMVER_PATTERN = /^\d+\.\d+\.\d+(-[a-zA-Z0-9.-]+)?(\+[a-zA-Z0-9.-]+)?$/;

export const atomIRSchema = z.discriminatedUnion('kind', [
  instructionIRSchema,
  hookIRSchema,
  toolIRSchema,
  agentIRSchema,
  ruleIRSchema,
  resourceIRSchema,
  promptIRSchema
]);

export type AtomIR = z.infer<typeof atomIRSchema>;

export const packageIRSchema = z
  .object({
    name: z
      .string()
      .min(1, 'Name must not be empty')
      .max(MAX_NAME_LENGTH, `Name must be ${MAX_NAME_LENGTH} characters or fewer`)
      .regex(NAME_PATTERN, 'Name must be scoped (@org/name), lowercase alphanumeric and hyphens'),
    version: z.string().regex(SEMVER_PATTERN, 'Version must be valid semver'),
    description: z.string().max(MAX_DESCRIPTION_LENGTH).optional(),
    atoms: z.array(atomIRSchema),
    includes: z.array(z.string()).optional(),
    skills: z.record(z.string(), z.string()).optional(),
    permissions: permissionsSchema.optional(),
    repository: z.string().url('Repository must be a valid URL').optional(),
    visibility: z.enum(['public', 'private']).optional(),
    audit: z
      .object({ min_score: z.number().min(0).max(10) })
      .strict()
      .optional(),
    publish: publishConfigSchema.optional()
  })
  .strict();

export type PackageIR = z.infer<typeof packageIRSchema>;
