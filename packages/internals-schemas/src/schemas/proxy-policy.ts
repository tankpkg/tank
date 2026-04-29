import { z } from 'zod';

export const perToolOverrideSchema = z
  .object({
    scan: z.boolean().optional(),
    blockOnMatch: z.boolean().optional()
  })
  .strict();

export const proxyPolicySchema = z
  .object({
    perfBudgetMs: z.number().positive().optional(),
    blockOnMatch: z.boolean().optional(),
    resetPinsOnMismatch: z.boolean().optional(),
    perTool: z.record(z.string(), perToolOverrideSchema).optional()
  })
  .strict();

export type PerToolOverride = z.infer<typeof perToolOverrideSchema>;
export type ProxyPolicy = z.infer<typeof proxyPolicySchema>;
