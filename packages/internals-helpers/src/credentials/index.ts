export { DEFAULT_ENTROPY_THRESHOLD_BITS_PER_CHAR, shannonEntropy } from '~/credentials/entropy.js';
export {
  ALPHANUMERIC,
  ALPHANUMERIC_UPPER,
  CREDENTIAL_PATTERNS,
  type CredentialPattern,
  HEX_LOWER
} from '~/credentials/patterns.js';
export { type CredentialMatch, type ScanMode, type ScanOptions, scan } from '~/credentials/scanner.js';
