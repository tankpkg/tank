import { z } from 'zod';

import { type AdapterCapabilities, adapterCapabilitiesSchema } from './capabilities.js';

export const compilationWarningSchema = z
  .object({
    level: z.enum(['degraded', 'skipped']),
    atomKind: z.string(),
    message: z.string()
  })
  .strict();

export type CompilationWarning = z.infer<typeof compilationWarningSchema>;

export const fileWriteSchema = z
  .object({
    path: z.string().min(1),
    content: z.string()
  })
  .strict();

export type FileWrite = z.infer<typeof fileWriteSchema>;

export const platformOutputSchema = z
  .object({
    files: z.array(fileWriteSchema),
    warnings: z.array(compilationWarningSchema)
  })
  .strict();

export type PlatformOutput = z.infer<typeof platformOutputSchema>;

export const platformAdapterMetaSchema = z
  .object({
    name: z.string().min(1, 'Adapter name must not be empty'),
    supportedRange: z.string().min(1, 'Supported range must not be empty'),
    capabilities: adapterCapabilitiesSchema
  })
  .strict();

export type PlatformAdapterMeta = z.infer<typeof platformAdapterMetaSchema>;

export interface PlatformAdapter extends PlatformAdapterMeta {
  capabilities: AdapterCapabilities;
  compileAtom(atom: unknown): PlatformOutput;
}
