export {
  BASE64_MAX_DECODED_BYTES,
  BASE64_MAX_RECURSION_DEPTH,
  collapseWhitespace,
  decodeBase64Substrings,
  decodeHomoglyphs,
  normalizeForScan,
  reverseLeet,
  stripZeroWidth
} from '~/prompt-injection/normalizer.js';
export { CLAWGUARD_PATTERN_COUNT, CLAWGUARD_PATTERNS } from '~/prompt-injection/patterns.js';
export type { ClawGuardCategory, ClawGuardPattern, ClawGuardSeverity } from '~/prompt-injection/types.js';
