import { z } from 'zod';

import { MAX_DESCRIPTION_LENGTH, MAX_NAME_LENGTH } from '~/constants/registry.js';

import { mcpServerSchema } from './mcp-server.js';
import { permissionsSchema } from './permissions.js';

const NAME_PATTERN = /^@[a-z0-9-]+\/[a-z0-9][a-z0-9-]*$/;
const SEMVER_PATTERN = /^\d+\.\d+\.\d+(-[a-zA-Z0-9.-]+)?(\+[a-zA-Z0-9.-]+)?$/;

const baseManifestFields = {
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
    .optional(),
  mcp_server: mcpServerSchema.optional()
};

/** Legacy skills.json schema — strict, no atoms. Used for backward-compatible consumers. */
export const skillsJsonSchema = z.object(baseManifestFields).strict();

export type SkillsJson = z.infer<typeof skillsJsonSchema>;

export const publishConfigSchema = z
  .object({
    build: z.string().min(1, 'publish.build must be a non-empty shell command').optional(),
    files: z.array(z.string().min(1)).optional()
  })
  .strict();

export type PublishConfig = z.infer<typeof publishConfigSchema>;

/**
 * Publish manifest schema — accepts both legacy skills.json AND atom-enriched tank.json.
 * The `atoms` and `includes` fields are passed through as opaque JSON arrays,
 * validated only at surface level. Full atom IR validation happens at build time.
 * The `publish` block is a CLI-only lifecycle config (build hook + files allow-list).
 */
export const publishManifestSchema = z
  .object({
    ...baseManifestFields,
    atoms: z.array(z.record(z.string(), z.unknown())).optional(),
    includes: z.array(z.string()).optional(),
    publish: publishConfigSchema.optional()
  })
  .strict();

export type PublishManifest = z.infer<typeof publishManifestSchema>;
