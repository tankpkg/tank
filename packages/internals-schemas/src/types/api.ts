import type { Permissions } from '~/schemas/permissions.js';

export type SkillVisibility = 'public' | 'private';

export interface PublishStartRequest {
  manifest: {
    name: string;
    version: string;
    description?: string;
    permissions?: Permissions;
    visibility?: SkillVisibility;
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
  visibility?: SkillVisibility;
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
  visibility?: SkillVisibility;
  latestVersion: string | null;
  /** @deprecated Use latestVersion. Search API responses do not include this alias. */
  version?: string | null;
  auditScore: number | null;
  publisher: string;
  downloads: number;
  stars: number;
  updatedAt?: string;
  atomKinds?: string[];
  scanVerdict?: string | null;
}

export interface SearchResponse {
  results: SearchResult[];
  total: number;
  page: number;
  limit: number;
}
