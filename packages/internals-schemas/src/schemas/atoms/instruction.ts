import { z } from 'zod';

import { extensionBagSchema } from './base.js';

export const instructionIRSchema = z
  .object({
    kind: z.literal('instruction'),
    content: z.string().min(1, 'Content path must not be empty'),
    scope: z.enum(['project', 'global', 'directory']).optional(),
    globs: z.array(z.string()).optional(),
    extensions: extensionBagSchema
  })
  .strict();

export type InstructionIR = z.infer<typeof instructionIRSchema>;
