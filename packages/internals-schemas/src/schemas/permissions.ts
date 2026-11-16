import { z } from 'zod';

export const networkPermissionsSchema = z
  .object({
    outbound: z.array(z.string()).optional()
  })
  .strict();

export const filesystemPermissionsSchema = z
  .object({
    read: z.array(z.string()).optional(),
    write: z.array(z.string()).optional()
  })
  .strict();

export const permissionsSchema = z
  .object({
    network: networkPermissionsSchema.optional(),
    filesystem: filesystemPermissionsSchema.optional(),
    subprocess: z.boolean().optional()
  })
  .strict();

export type Permissions = z.infer<typeof permissionsSchema>;

/**
 * Read-side permissions: same field types, but unknown keys (e.g. a documented "environment"
 * list, or anything an older writer copied from registry metadata) pass through instead of
 * failing. Budget checks only look at network/filesystem/subprocess, so extras are inert.
 * Use for files users already have (tank.json budgets, existing tank.lock entries); keep
 * `permissionsSchema` for anything Tank validates before publishing or writing.
 */
export const permissionsReadSchema = z.looseObject({
  network: networkPermissionsSchema.loose().optional(),
  filesystem: filesystemPermissionsSchema.loose().optional(),
  subprocess: z.boolean().optional()
});
export type NetworkPermissions = z.infer<typeof networkPermissionsSchema>;
export type FilesystemPermissions = z.infer<typeof filesystemPermissionsSchema>;

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
  'org.member.remove',
  'org.delete'
]);
export type AdminAction = z.infer<typeof adminActionSchema>;

export function isAdmin(role: string): role is 'admin' {
  return role === 'admin';
}
