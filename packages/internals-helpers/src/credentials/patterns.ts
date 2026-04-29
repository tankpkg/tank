export interface CredentialPattern {
  id: string;
  label: string;
  prefix: string;
  regex: RegExp;
  charset: string;
  length: number;
  /**
   * When true, the regex match alone is authoritative — no entropy gate
   * is applied. Use for structural credentials (JWT segments, URLs, fixed
   * Slack webhook paths) whose shape cannot be faked by a low-entropy
   * repeat string. Defaults to false (entropy gate applied).
   */
  structural?: boolean;
  /**
   * Per-pattern Shannon entropy floor in bits/char, applied to the match
   * body after the `prefix` is stripped. Calibrated to the 5th percentile
   * of simulated random key distributions (see C25a). Only consulted when
   * `structural` is not true. Defaults to DEFAULT_ENTROPY_THRESHOLD_BITS_PER_CHAR.
   */
  minEntropy?: number;
  /**
   * Case-insensitive substring denylist for docs/placeholder detection.
   * When a match contains any of these substrings, it is rejected before
   * entropy is checked. AWS real keys are statistically indistinguishable
   * from AWS docs-example keys by entropy alone; the denylist closes that
   * gap (e.g. AKIAIOSFODNN7EXAMPLE contains "EXAMPLE").
   */
  placeholderDenylist?: readonly string[];
}

export const ALPHANUMERIC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
export const ALPHANUMERIC_UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
export const HEX_LOWER = '0123456789abcdef';

const COMMON_PLACEHOLDERS = ['EXAMPLE', 'PLACEHOLDER', 'YOUR_KEY', 'YOUR-KEY', 'XXXXXX'] as const;

export const CREDENTIAL_PATTERNS: CredentialPattern[] = [
  {
    id: 'stripe_secret',
    label: 'Stripe Secret Key',
    prefix: 'sk_live_',
    regex: /(?:sk_live_|sk_test_)[A-Za-z0-9]{16,64}/g,
    charset: ALPHANUMERIC,
    length: 0,
    minEntropy: 3.95,
    placeholderDenylist: COMMON_PLACEHOLDERS
  },
  {
    id: 'stripe_publishable',
    label: 'Stripe Publishable Key',
    prefix: 'pk_live_',
    regex: /(?:pk_live_|pk_test_)[A-Za-z0-9]{16,64}/g,
    charset: ALPHANUMERIC,
    length: 0,
    minEntropy: 3.95,
    placeholderDenylist: COMMON_PLACEHOLDERS
  },
  {
    id: 'aws_access_key',
    label: 'AWS Access Key ID',
    prefix: 'AKIA',
    regex: /AKIA[A-Z0-9]{16}/g,
    charset: ALPHANUMERIC_UPPER,
    length: 20,
    minEntropy: 3.3,
    placeholderDenylist: COMMON_PLACEHOLDERS
  },
  {
    id: 'github_pat',
    label: 'GitHub Personal Access Token',
    prefix: 'ghp_',
    regex: /ghp_[A-Za-z0-9]{36}/g,
    charset: ALPHANUMERIC,
    length: 40,
    minEntropy: 4.4,
    placeholderDenylist: COMMON_PLACEHOLDERS
  },
  {
    id: 'github_oauth',
    label: 'GitHub OAuth Token',
    prefix: 'gho_',
    regex: /gho_[A-Za-z0-9]{36}/g,
    charset: ALPHANUMERIC,
    length: 40,
    minEntropy: 3.75,
    placeholderDenylist: COMMON_PLACEHOLDERS
  },
  {
    id: 'openai_key',
    label: 'OpenAI API Key',
    prefix: 'sk-proj-',
    regex: /sk-(?:proj-)?[A-Za-z0-9_-]{20,128}/g,
    charset: `${ALPHANUMERIC}_-`,
    length: 0,
    minEntropy: 4.5,
    placeholderDenylist: COMMON_PLACEHOLDERS
  },
  {
    id: 'elevenlabs_key',
    label: 'ElevenLabs API Key',
    prefix: 'elvn_',
    regex: /elvn_[A-Za-z0-9]{20,64}/g,
    charset: ALPHANUMERIC,
    length: 0,
    minEntropy: 4.0,
    placeholderDenylist: COMMON_PLACEHOLDERS
  },
  {
    id: 'jwt_token',
    label: 'JWT Token',
    prefix: 'eyJ',
    regex: /eyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}/g,
    charset: `${ALPHANUMERIC}_-.`,
    length: 0,
    structural: true
  },
  {
    id: 'database_url',
    label: 'Database URL',
    prefix: 'postgresql://',
    regex: /(?:postgres(?:ql)?|mysql|mariadb|mongodb(?:\+srv)?|redis):\/\/[^\s"'`]+/g,
    charset: `${ALPHANUMERIC}:/?&=._-@+%$!~*(),`,
    length: 0,
    structural: true
  },
  {
    id: 'slack_webhook',
    label: 'Slack Webhook URL',
    prefix: 'https://hooks.slack.com/services/',
    regex: /https:\/\/hooks\.slack\.com\/services\/[A-Z0-9]{9,12}\/[A-Z0-9]{9,12}\/[A-Za-z0-9]{24,}/g,
    charset: `${ALPHANUMERIC}:/.`,
    length: 0,
    structural: true
  }
];
