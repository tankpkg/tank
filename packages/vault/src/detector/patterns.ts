export interface CredentialPattern {
  id: string;
  label: string;
  /** Fixed prefix that identifies this credential type (e.g., "sk_live_", "AKIA") */
  prefix: string;
  /** Regex matching the full credential — must not use backtracking (C4) */
  regex: RegExp;
  /** Character set for the suffix — used by the fake generator */
  charset: string;
  /** Expected total length (0 = variable length) */
  length: number;
}

export const ALPHANUMERIC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
export const ALPHANUMERIC_UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
export const HEX_LOWER = '0123456789abcdef';

export const CREDENTIAL_PATTERNS: CredentialPattern[] = [
  {
    id: 'stripe_secret',
    label: 'Stripe Secret Key',
    prefix: 'sk_live_',
    regex: /(?:sk_live_|sk_test_)[A-Za-z0-9]{16,64}/g,
    charset: ALPHANUMERIC,
    length: 0
  },
  {
    id: 'stripe_publishable',
    label: 'Stripe Publishable Key',
    prefix: 'pk_live_',
    regex: /(?:pk_live_|pk_test_)[A-Za-z0-9]{16,64}/g,
    charset: ALPHANUMERIC,
    length: 0
  },
  {
    id: 'aws_access_key',
    label: 'AWS Access Key ID',
    prefix: 'AKIA',
    regex: /AKIA[A-Z0-9]{16}/g,
    charset: ALPHANUMERIC_UPPER,
    length: 20
  },
  {
    id: 'github_pat',
    label: 'GitHub Personal Access Token',
    prefix: 'ghp_',
    regex: /ghp_[A-Za-z0-9]{36}/g,
    charset: ALPHANUMERIC,
    length: 40
  },
  {
    id: 'github_oauth',
    label: 'GitHub OAuth Token',
    prefix: 'gho_',
    regex: /gho_[A-Za-z0-9]{36}/g,
    charset: ALPHANUMERIC,
    length: 40
  },
  {
    id: 'openai_key',
    label: 'OpenAI API Key',
    prefix: 'sk-proj-',
    regex: /sk-(?:proj-)?[A-Za-z0-9_-]{20,128}/g,
    charset: `${ALPHANUMERIC}_-`,
    length: 0
  },
  {
    id: 'elevenlabs_key',
    label: 'ElevenLabs API Key',
    prefix: 'elvn_',
    regex: /elvn_[A-Za-z0-9]{20,64}/g,
    charset: ALPHANUMERIC,
    length: 0
  },
  {
    id: 'jwt_token',
    label: 'JWT Token',
    prefix: 'eyJ',
    regex: /eyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}/g,
    charset: `${ALPHANUMERIC}_-.`,
    length: 0
  },
  {
    id: 'database_url',
    label: 'Database URL',
    prefix: 'postgresql://',
    regex: /(?:postgres(?:ql)?|mysql|mariadb|mongodb(?:\+srv)?|redis):\/\/[^\s"'`]+/g,
    charset: `${ALPHANUMERIC}:/?&=._-@+%$!~*(),`,
    length: 0
  },
  {
    id: 'slack_webhook',
    label: 'Slack Webhook URL',
    prefix: 'https://hooks.slack.com/services/',
    regex: /https:\/\/hooks\.slack\.com\/services\/[A-Z0-9]{9,12}\/[A-Z0-9]{9,12}\/[A-Za-z0-9]{24,}/g,
    charset: `${ALPHANUMERIC}:/.`,
    length: 0
  }
];
