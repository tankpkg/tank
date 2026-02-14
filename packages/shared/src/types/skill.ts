export interface Publisher {
  id: string;
  userId: string;
  name: string;
  createdAt: Date;
}

export interface Skill {
  id: string;
  name: string;
  description: string | null;
  publisherId: string;
  orgId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SkillVersion {
  id: string;
  skillId: string;
  version: string;
  integrity: string;
  storagePath: string;
  fileCount: number;
  totalSize: number;
  permissions: Record<string, unknown>;
  auditScore: number | null;
  analysisStatus: 'pending' | 'completed' | 'failed';
  analysisResults: Record<string, unknown> | null;
  publishedAt: Date;
}
