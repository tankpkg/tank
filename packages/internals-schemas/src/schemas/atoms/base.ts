import { z } from 'zod';

export const atomKindSchema = z.enum(['instruction', 'hook', 'tool', 'agent', 'rule', 'resource', 'prompt']);

export type AtomKind = z.infer<typeof atomKindSchema>;

export const extensionBagSchema = z.record(z.string(), z.unknown()).optional();

export type ExtensionBag = z.infer<typeof extensionBagSchema>;
