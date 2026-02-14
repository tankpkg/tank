import type { Permissions } from '../schemas/permissions.js';

export interface PublishStartRequest {
  manifest: {
    name: string;
    version: string;
    description?: string;
    permissions?: Permissions;
  };
}

export interface PublishStartResponse {
  uploadUrl: string;
  uploadHeaders: Record<string, string>;
  skillId: string;
  versionId: string;
}

export interface PublishConfirmRequest {
  versionId: string;
  integrity: string;
}

export interface SkillInfoResponse {
  name: string;
  description: string | null;
  latestVersion: string;
  versions: string[];
  permissions: Permissions | null;
  auditScore: number | null;
  downloads: number;
  publishedAt: string;
}

export interface SearchResult {
  name: string;
  description: string | null;
  version: string;
  auditScore: number | null;
  downloads: number;
}

export interface SearchResponse {
  results: SearchResult[];
  total: number;
  page: number;
  limit: number;
}
