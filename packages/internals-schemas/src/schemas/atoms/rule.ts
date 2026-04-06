import { z } from 'zod';

import { extensionBagSchema } from './base.js';
import { hookEventSchema } from './events.js';
import { canonicalToolNameSchema } from './tool-names.js';

export const ruleIRSchema = z
  .object({
    kind: z.literal('rule'),
    name: z.string().optional(),
    event: hookEventSchema,
    match: canonicalToolNameSchema.or(z.string().min(1)).optional(),
    policy: z.enum(['block', 'allow', 'warn']),
    reason: z.string().optional(),
    extensions: extensionBagSchema
  })
  .strict();

export type RuleIR = z.infer<typeof ruleIRSchema>;
