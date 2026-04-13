import { z } from 'zod';

import { extensionBagSchema } from './base.js';

export const resourceIRSchema = z
  .object({
    kind: z.literal('resource'),
    name: z.string().optional(),
    uri: z.string().min(1, 'Resource URI must not be empty'),
    description: z.string().optional(),
    mimeType: z.string().optional(),
    extensions: extensionBagSchema
  })
  .strict();

export type ResourceIR = z.infer<typeof resourceIRSchema>;
