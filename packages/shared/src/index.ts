// Constants

export { DEFAULT_PERMISSIONS, PERMISSION_CATEGORIES, type PermissionCategory } from './constants/permissions.js';
export {
  LEGACY_LOCKFILE_FILENAME,
  LEGACY_MANIFEST_FILENAME,
  LOCKFILE_FILENAME,
  LOCKFILE_VERSION,
  MANIFEST_FILENAME,
  MAX_DESCRIPTION_LENGTH,
  MAX_FILE_COUNT,
  MAX_NAME_LENGTH,
  MAX_PACKAGE_SIZE,
  REGISTRY_API_VERSION,
  REGISTRY_URL
} from './constants/registry.js';

// Resolver
export { resolve, sortVersions } from './lib/resolver.js';

// URL helpers
export { encodeSkillName } from './lib/url.js';

// Brand configuration
export type { BrandConfig, BrandColors, BrandLogo, BrandSocial, BrandEnvVars } from './brand.js';
export { DEFAULT_BRAND, isValidHexColor, hexToOklch } from './brand.js';

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
