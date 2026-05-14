import { and, desc, eq, inArray, sql } from 'drizzle-orm';

import { db } from '~/lib/db';
import { scanResults, skills, skillVersions } from '~/lib/db/schema';
import {
  type BulkRescanCandidate,
  type BulkRescanFilter,
  type BulkRescanResult,
  orchestrateBulkRescan
} from '~/lib/skills/bulk-rescan';
import { runRescan } from '~/lib/skills/rescan';

export async function findRescanCandidates(filter: BulkRescanFilter): Promise<BulkRescanCandidate[]> {
  const latestVersionPerSkill = db
    .select({
      skillId: skillVersions.skillId,
      versionId: skillVersions.id,
      version: skillVersions.version,
      auditStatus: skillVersions.auditStatus,
      createdAt: skillVersions.createdAt
    })
    .from(skillVersions)
    .where(
      sql`${skillVersions.createdAt} = (
        SELECT MAX(sv2.created_at) FROM ${skillVersions} sv2 WHERE sv2.skill_id = ${skillVersions.skillId}
      )`
    )
    .as('latest_version');

  const latestScanPerVersion = db
    .select({
      versionId: scanResults.versionId,
      lastScannedAt: scanResults.createdAt
    })
    .from(scanResults)
    .where(
      sql`${scanResults.createdAt} = (
        SELECT MAX(sr2.created_at) FROM ${scanResults} sr2 WHERE sr2.version_id = ${scanResults.versionId}
      )`
    )
    .as('latest_scan');

  const conditions = [];
  if (filter.status && filter.status.length > 0) {
    conditions.push(inArray(sql`${latestVersionPerSkill.auditStatus}`, filter.status as string[]));
  }
  if (filter.beforeScannedAt) {
    conditions.push(
      sql`(${latestScanPerVersion.lastScannedAt} IS NULL OR ${latestScanPerVersion.lastScannedAt} < ${filter.beforeScannedAt})`
    );
  }

  const rows = await db
    .select({
      skillId: skills.id,
      skillName: skills.name,
      version: latestVersionPerSkill.version,
      auditStatus: latestVersionPerSkill.auditStatus,
      lastScannedAt: latestScanPerVersion.lastScannedAt
    })
    .from(skills)
    .innerJoin(latestVersionPerSkill, eq(latestVersionPerSkill.skillId, skills.id))
    .leftJoin(latestScanPerVersion, eq(latestScanPerVersion.versionId, latestVersionPerSkill.versionId))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(latestVersionPerSkill.createdAt));

  return rows.map((r) => ({
    skillId: r.skillId,
    skillName: r.skillName,
    version: r.version,
    auditStatus: r.auditStatus,
    lastScannedAt: r.lastScannedAt
  }));
}

export async function runBulkRescan(filter: BulkRescanFilter, adminUserId: string): Promise<BulkRescanResult> {
  const candidates = await findRescanCandidates(filter);
  return orchestrateBulkRescan({ candidates, rescan: runRescan, adminUserId, filter });
}
