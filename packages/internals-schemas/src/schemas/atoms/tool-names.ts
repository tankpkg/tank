import { z } from 'zod';

export const canonicalToolNameSchema = z.enum([
  'bash',
  'read',
  'write',
  'edit',
  'grep',
  'glob',
  'lsp',
  'mcp',
  'browser',
  'fetch',
  'git',
  'task',
  'notebook'
]);

export type CanonicalToolName = z.infer<typeof canonicalToolNameSchema>;

export const CANONICAL_TOOL_NAMES = canonicalToolNameSchema.options;
