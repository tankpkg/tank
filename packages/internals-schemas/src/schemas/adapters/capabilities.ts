import { z } from 'zod';

export const supportLevelSchema = z.enum(['full', 'degraded', 'none']);

export type SupportLevel = z.infer<typeof supportLevelSchema>;

export const adapterCapabilitiesSchema = z
  .object({
    instruction: supportLevelSchema,
    hook: supportLevelSchema,
    tool: supportLevelSchema,
    agent: supportLevelSchema,
    rule: supportLevelSchema,
    resource: supportLevelSchema,
    prompt: supportLevelSchema
  })
  .strict();

export type AdapterCapabilities = z.infer<typeof adapterCapabilitiesSchema>;
