import { z } from 'zod';

import { extensionBagSchema } from './base.js';
import { hookEventSchema } from './events.js';
import { canonicalToolNameSchema } from './tool-names.js';

export const hookActionIRSchema = z
  .object({
    action: z.enum(['block', 'allow', 'rewrite', 'injectContext']),
    match: z.string().optional(),
    reason: z.string().optional(),
    value: z.string().optional()
  })
  .strict();

export type HookActionIR = z.infer<typeof hookActionIRSchema>;

export const hookDslHandlerSchema = z
  .object({
    type: z.literal('dsl'),
    actions: z.array(hookActionIRSchema).min(1, 'DSL handler must have at least one action')
  })
  .strict();

export const hookJsHandlerSchema = z
  .object({
    type: z.literal('js'),
    entry: z.string().min(1, 'JS handler entry path must not be empty')
  })
  .strict();

export const hookHandlerIRSchema = z.discriminatedUnion('type', [hookDslHandlerSchema, hookJsHandlerSchema]);

export type HookHandlerIR = z.infer<typeof hookHandlerIRSchema>;

export const hookIRSchema = z
  .object({
    kind: z.literal('hook'),
    name: z.string().optional(),
    event: hookEventSchema,
    match: canonicalToolNameSchema.or(z.string().min(1)).optional(),
    handler: hookHandlerIRSchema,
    scope: z.enum(['project', 'global']).optional(),
    extensions: extensionBagSchema
  })
  .strict();

export type HookIR = z.infer<typeof hookIRSchema>;
