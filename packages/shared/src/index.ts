// Schemas

export { DEFAULT_PERMISSIONS, PERMISSION_CATEGORIES, type PermissionCategory } from './constants/permissions.js';
// Constants
export {
  REGISTRY_URL,
  REGISTRY_API_VERSION,
  MAX_PACKAGE_SIZE,
  MAX_FILE_COUNT,
  MAX_NAME_LENGTH,
  MAX_DESCRIPTION_LENGTH,
  LOCKFILE_VERSION,
  MANIFEST_FILENAME,
  LEGACY_MANIFEST_FILENAME,
  LOCKFILE_FILENAME,
  LEGACY_LOCKFILE_FILENAME
} from './constants/registry.js';
export { PERMISSION_CATEGORIES, DEFAULT_PERMISSIONS, type PermissionCategory } from './constants/permissions.js';

// Resolver
export { resolve, sortVersions } from './lib/resolver.js';
// URL helpers
export { encodeSkillName } from './lib/url.js';
// Admin types
export {
  type AdminAction,
  adminActionSchema,
  type FilesystemPermissions,
  filesystemPermissionsSchema,
  isAdmin,
  type NetworkPermissions,
  networkPermissionsSchema,
  type Permissions,
  permissionsSchema,
  type SkillStatus,
  skillStatusSchema,
  type UserRole,
  type UserStatus,
  userRoleSchema,
  userStatusSchema
} from './schemas/permissions.js';
export { type SkillsJson, skillsJsonSchema } from './schemas/skills-json.js';
export {
  type LockedSkill,
  type LockedSkillV1,
  type SkillsLock,
  skillsLockSchema,
  skillsLockV1Schema
} from './schemas/skills-lock.js';
export type {
  PublishConfirmRequest,
  PublishStartRequest,
  PublishStartResponse,
  SearchResponse,
  SearchResult,
  SkillInfoResponse
} from './types/api.js';
// Types
export type { Publisher, Skill, SkillVersion } from './types/skill.js';
