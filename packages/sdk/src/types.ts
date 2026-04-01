import type { Permissions } from '@internals/schemas';

export type {
  AdminAction,
  FilesystemPermissions,
  LockedSkill,
  NetworkPermissions,
  Permissions,
  PublishConfirmRequest,
  Publisher,
  PublishStartRequest,
  PublishStartResponse,
  SearchResponse,
  SearchResult,
  Skill,
  SkillInfoResponse,
  SkillStatus,
  SkillsJson,
  SkillsLock,
  SkillVersion,
  SkillVisibility,
  UserRole,
  UserStatus
} from '@internals/schemas';

export type AuditStatus = 'pending-upload' | 'scanning' | 'completed' | 'flagged' | 'failed' | 'scan-failed';
export type ScanVerdict = 'pass' | 'pass_with_notes' | 'flagged' | 'fail' | null;

export interface VersionDetail {
  name: string;
  version: string;
  description: string | null;
  integrity: string;
  permissions: Permissions | null;
  auditScore: number | null;
  auditStatus: AuditStatus;
  downloadUrl: string;
  publishedAt: string;
  downloads: number;
  scanVerdict: ScanVerdict;
  scanFindings: Array<{
    stage: string;
    severity: string;
    type: string;
    description: string;
    location: string | null;
  }>;
  dependencies: Record<string, string>;
}

export interface TankClientOptions {
  token?: string;
  registryUrl?: string;
  configDir?: string;
  maxRetries?: number;
  timeoutMs?: number;
}

export interface UserInfo {
  userId: string;
  name: string | null;
  email: string | null;
}

export interface ProgressEvent {
  phase: 'resolving' | 'downloading' | 'extracting' | 'verifying' | 'linking';
  skill: string;
  current: number;
  total: number;
  progress: number;
}

export interface InstallOptions {
  projectDir?: string;
  yes?: boolean;
  onProgress?: (event: ProgressEvent) => void;
}

export interface InstallResult {
  installed: Array<{ name: string; version: string }>;
  alreadyInstalled: boolean;
}

export interface UpdateResult {
  updated: Array<{ name: string; from: string; to: string }>;
}

export interface RemoveResult {
  removed: string[];
}

export interface DownloadOptions {
  dest?: string;
  buffer?: boolean;
}

export interface ExtractResult {
  path: string;
  files: string[];
  integrity: string;
}

export interface LinkOptions {
  agents?: string[];
}

export interface LinkResult {
  linked: string[];
}
