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

// Admin types and schemas
export const userRoleSchema = z.enum(['user', 'admin']);
export type UserRole = z.infer<typeof userRoleSchema>;

export const userStatusSchema = z.enum(['active', 'suspended', 'banned']);
export type UserStatus = z.infer<typeof userStatusSchema>;

export const skillStatusSchema = z.enum(['active', 'deprecated', 'quarantined', 'removed']);
export type SkillStatus = z.infer<typeof skillStatusSchema>;

export const adminActionSchema = z.enum([
  'user.ban',
  'user.suspend',
  'user.unban',
  'user.promote',
  'user.demote',
  'skill.quarantine',
  'skill.remove',
  'skill.deprecate',
  'skill.restore',
  'skill.feature',
  'skill.unfeature',
  'org.suspend',
  'org.delete',
]);
export type AdminAction = z.infer<typeof adminActionSchema>;

export function isAdmin(role: string): role is 'admin' {
  return role === 'admin';
}
