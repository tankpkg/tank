import { z } from 'zod';

import { extensionBagSchema } from './base.js';
import { modelTierSchema } from './model-tiers.js';
import { canonicalToolNameSchema } from './tool-names.js';

export const agentIRSchema = z
  .object({
    kind: z.literal('agent'),
    name: z.string().min(1, 'Agent name must not be empty'),
    role: z.string().min(1, 'Agent role must not be empty'),
    tools: z.array(canonicalToolNameSchema.or(z.string().min(1))).optional(),
    model: modelTierSchema.or(z.string().min(1)).optional(),
    readonly: z.boolean().optional(),
    extensions: extensionBagSchema
  })
  .strict();

export type AgentIR = z.infer<typeof agentIRSchema>;
