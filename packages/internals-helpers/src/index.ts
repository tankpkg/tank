export {
  ALPHANUMERIC,
  ALPHANUMERIC_UPPER,
  CREDENTIAL_PATTERNS,
  type CredentialMatch,
  type CredentialPattern,
  DEFAULT_ENTROPY_THRESHOLD_BITS_PER_CHAR,
  HEX_LOWER,
  type ScanOptions,
  scan,
  shannonEntropy
} from '~/credentials/index.js';
export { resolve, sortVersions } from '~/lib/resolver.js';
export { encodeSkillName } from '~/lib/url.js';
export {
  BASE64_MAX_DECODED_BYTES,
  BASE64_MAX_RECURSION_DEPTH,
  collapseWhitespace,
  decodeBase64Substrings,
  decodeHomoglyphs,
  normalizeForScan,
  reverseLeet,
  stripZeroWidth
} from '~/prompt-injection/index.js';
export {
  checkPermissionEscalation,
  type EscalationResult,
  type EscalationViolation,
  type VersionPermissions
} from '~/permission-escalation.js';
export {
  checkPermissionBudget,
  collectPermissionViolations,
  isDomainAllowed,
  isPathAllowed,
  isPathAllowedWithRealpath,
  PermissionBudgetError,
  type PermissionsShape,
  type PermissionViolation
} from '~/permissions/index.js';
