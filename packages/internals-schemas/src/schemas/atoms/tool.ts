import { z } from 'zod';

import { extensionBagSchema } from './base.js';

export const mcpServerConfigSchema = z
  .object({
    command: z.string().min(1).optional(),
    args: z.array(z.string()).optional(),
    env: z.record(z.string(), z.string()).optional(),
    runtime: z.string().min(1).optional(),
    entry: z.string().min(1).optional(),
    package: z.string().min(1).optional()
  })
  .strict()
  .refine(
    (data) => Boolean(data.command) || Boolean(data.runtime && (data.entry || data.package)),
    'MCP config must have either "command" or "runtime" plus one of "entry"/"package"'
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
