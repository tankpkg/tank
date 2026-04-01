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
  REGISTRY_URL,
  REGISTRY_URL as DEFAULT_REGISTRY_URL
} from '@internals/schemas';

export const SDK_VERSION = '0.10.6';
export const DEFAULT_CONFIG_DIR = '~/.tank';
export const DEFAULT_MAX_RETRIES = 3;
export const DEFAULT_TIMEOUT_MS = 30_000;

export const SUPPORTED_AGENTS = ['opencode', 'cursor', 'windsurf', 'claude-code', 'codex'] as const;
export type SupportedAgent = (typeof SUPPORTED_AGENTS)[number];

export const AGENT_PATHS: Record<SupportedAgent, string> = {
  opencode: '.opencode',
  cursor: '.cursor',
  windsurf: '.windsurf',
  'claude-code': '.claude',
  codex: '.codex'
};
