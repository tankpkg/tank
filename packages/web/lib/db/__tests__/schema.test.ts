import { getTableColumns, getTableName } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { user } from '../auth-schema';
import {
  auditEvents,
  skillDownloadDaily,
  skillDownloadDailyRelations,
  skills,
  skillsRelations,
  skillVersions,
  skillVersionsRelations
} from '../schema';

describe('schema exports', () => {
  it('exports all 4 business tables', () => {
    expect(skills).toBeDefined();
    expect(skillVersions).toBeDefined();
    expect(skillDownloadDaily).toBeDefined();
    expect(auditEvents).toBeDefined();
  });

  it('exports user table from auth-schema', () => {
    expect(user).toBeDefined();
  });

  it('exports all relation definitions', () => {
    expect(skillsRelations).toBeDefined();
    expect(skillVersionsRelations).toBeDefined();
    expect(skillDownloadDailyRelations).toBeDefined();
  });
});

describe('user table (auth-schema)', () => {
  it('has correct table name', () => {
    expect(getTableName(user)).toBe('user');
  });

  it('has expected columns including githubUsername', () => {
    const cols = getTableColumns(user);
    expect(cols.id).toBeDefined();
    expect(cols.name).toBeDefined();
    expect(cols.email).toBeDefined();
    expect(cols.emailVerified).toBeDefined();
    expect(cols.image).toBeDefined();
    expect(cols.githubUsername).toBeDefined();
    expect(cols.createdAt).toBeDefined();
    expect(cols.updatedAt).toBeDefined();
  });

  it('githubUsername is unique and nullable', () => {
    const cols = getTableColumns(user);
    expect(cols.githubUsername.notNull).toBe(false);
    expect(cols.githubUsername.isUnique).toBe(true);
  });
});

describe('skills table', () => {
  it('has correct table name', () => {
    expect(getTableName(skills)).toBe('skills');
  });

  it('has expected columns', () => {
    const cols = getTableColumns(skills);
    expect(cols.id).toBeDefined();
    expect(cols.name).toBeDefined();
    expect(cols.description).toBeDefined();
    expect(cols.publisherId).toBeDefined();
    expect(cols.orgId).toBeDefined();
    expect(cols.repositoryUrl).toBeDefined();
    expect(cols.createdAt).toBeDefined();
    expect(cols.updatedAt).toBeDefined();
  });

  it('name is unique and not null', () => {
    const cols = getTableColumns(skills);
    expect(cols.name.notNull).toBe(true);
    expect(cols.name.isUnique).toBe(true);
  });

  it('publisherId is text type referencing user.id', () => {
    const cols = getTableColumns(skills);
    expect(cols.publisherId.dataType).toBe('string');
    expect(cols.publisherId.notNull).toBe(true);
  });

  it('orgId is nullable', () => {
    const cols = getTableColumns(skills);
    expect(cols.orgId.notNull).toBe(false);
  });
});

describe('skill_versions table', () => {
  it('has correct table name', () => {
    expect(getTableName(skillVersions)).toBe('skill_versions');
  });

  it('has expected columns', () => {
    const cols = getTableColumns(skillVersions);
    expect(cols.id).toBeDefined();
    expect(cols.skillId).toBeDefined();
    expect(cols.version).toBeDefined();
    expect(cols.integrity).toBeDefined();
    expect(cols.tarballPath).toBeDefined();
    expect(cols.tarballSize).toBeDefined();
    expect(cols.fileCount).toBeDefined();
    expect(cols.manifest).toBeDefined();
    expect(cols.permissions).toBeDefined();
    expect(cols.auditScore).toBeDefined();
    expect(cols.auditStatus).toBeDefined();
    expect(cols.readme).toBeDefined();
    expect(cols.publishedBy).toBeDefined();
    expect(cols.createdAt).toBeDefined();
  });

  it('publishedBy is text type referencing user.id', () => {
    const cols = getTableColumns(skillVersions);
    expect(cols.publishedBy.dataType).toBe('string');
    expect(cols.publishedBy.notNull).toBe(true);
  });

  it('auditStatus defaults to pending', () => {
    const cols = getTableColumns(skillVersions);
    expect(cols.auditStatus.hasDefault).toBe(true);
  });

  it('auditScore is nullable', () => {
    const cols = getTableColumns(skillVersions);
    expect(cols.auditScore.notNull).toBe(false);
  });
});

describe('skill_download_daily table', () => {
  it('has correct table name', () => {
    expect(getTableName(skillDownloadDaily)).toBe('skill_download_daily');
  });

  it('has expected columns', () => {
    const cols = getTableColumns(skillDownloadDaily);
    expect(cols.id).toBeDefined();
    expect(cols.skillId).toBeDefined();
    expect(cols.date).toBeDefined();
    expect(cols.count).toBeDefined();
  });

  it('count is not null', () => {
    const cols = getTableColumns(skillDownloadDaily);
    expect(cols.count.notNull).toBe(true);
  });
});

describe('audit_events table', () => {
  it('has correct table name', () => {
    expect(getTableName(auditEvents)).toBe('audit_events');
  });

  it('has expected columns', () => {
    const cols = getTableColumns(auditEvents);
    expect(cols.id).toBeDefined();
    expect(cols.action).toBeDefined();
    expect(cols.actorId).toBeDefined();
    expect(cols.targetType).toBeDefined();
    expect(cols.targetId).toBeDefined();
    expect(cols.metadata).toBeDefined();
    expect(cols.createdAt).toBeDefined();
  });

  it('actorId is nullable for system events', () => {
    const cols = getTableColumns(auditEvents);
    expect(cols.actorId.notNull).toBe(false);
  });

  it('action is required', () => {
    const cols = getTableColumns(auditEvents);
    expect(cols.action.notNull).toBe(true);
  });
});

describe('type inference', () => {
  it('$inferSelect produces correct types', () => {
    type User = typeof user.$inferSelect;
    type Skill = typeof skills.$inferSelect;
    type SkillVersion = typeof skillVersions.$inferSelect;
    type SkillDownloadDaily = typeof skillDownloadDaily.$inferSelect;
    type AuditEvent = typeof auditEvents.$inferSelect;

    // Type-level assertions — if these compile, types are correct
    const _userCheck: User = {} as User;
    const _skillCheck: Skill = {} as Skill;
    const _versionCheck: SkillVersion = {} as SkillVersion;
    const _downloadCheck: SkillDownloadDaily = {} as SkillDownloadDaily;
    const _auditCheck: AuditEvent = {} as AuditEvent;

    expect(_userCheck).toBeDefined();
    expect(_skillCheck).toBeDefined();
    expect(_versionCheck).toBeDefined();
    expect(_downloadCheck).toBeDefined();
    expect(_auditCheck).toBeDefined();
  });
});
