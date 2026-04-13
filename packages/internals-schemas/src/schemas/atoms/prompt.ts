import { z } from 'zod';

import { extensionBagSchema } from './base.js';

export const promptIRSchema = z
  .object({
    kind: z.literal('prompt'),
    name: z.string().min(1, 'Prompt name must not be empty'),
    description: z.string().optional(),
    template: z.string().min(1, 'Prompt template path must not be empty'),
    arguments: z
      .array(
        z.object({ name: z.string(), description: z.string().optional(), required: z.boolean().optional() }).strict()
      )
      .optional(),
    extensions: extensionBagSchema
  })
  .strict();

export type PromptIR = z.infer<typeof promptIRSchema>;
