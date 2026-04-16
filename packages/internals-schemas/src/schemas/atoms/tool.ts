import { z } from 'zod';

import { extensionBagSchema } from './base.js';

export const mcpServerConfigSchema = z
  .object({
    command: z.string().min(1).optional(),
    args: z.array(z.string()).optional(),
    env: z.record(z.string(), z.string()).optional(),
    runtime: z.string().min(1).optional(),
    entry: z.string().min(1).optional()
  })
  .strict()
  .refine(
    (data) => data.command || (data.runtime && data.entry),
    'MCP config must have either "command" or both "runtime" and "entry"'
  );

export const toolIRSchema = z
  .object({
    kind: z.literal('tool'),
    name: z.string().min(1, 'Tool name must not be empty'),
    description: z.string().optional(),
    mcp: mcpServerConfigSchema.optional(),
    extensions: extensionBagSchema
  })
  .strict();

export type ToolIR = z.infer<typeof toolIRSchema>;
