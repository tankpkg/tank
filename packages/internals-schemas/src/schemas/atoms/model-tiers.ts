import { z } from 'zod';

export const modelTierSchema = z.enum(['fast', 'balanced', 'powerful', 'custom']);

export type ModelTier = z.infer<typeof modelTierSchema>;

export const MODEL_TIERS = modelTierSchema.options;
