import { z } from 'zod';

export const networkPermissionsSchema = z.object({
  outbound: z.array(z.string()).optional(), // domain allowlist with glob: "*.example.com"
}).strict();

export const filesystemPermissionsSchema = z.object({
  read: z.array(z.string()).optional(),   // glob patterns relative to project root
  write: z.array(z.string()).optional(),  // glob patterns relative to project root
}).strict();

export const permissionsSchema = z.object({
  network: networkPermissionsSchema.optional(),
  filesystem: filesystemPermissionsSchema.optional(),
  subprocess: z.boolean().optional(),
}).strict();

export type Permissions = z.infer<typeof permissionsSchema>;
export type NetworkPermissions = z.infer<typeof networkPermissionsSchema>;
export type FilesystemPermissions = z.infer<typeof filesystemPermissionsSchema>;
