import { queryOptions } from '@tanstack/react-query';
import { createServerFn } from '@tanstack/react-start';
import { getRequestHeaders } from '@tanstack/react-start/server';
import { sql } from 'drizzle-orm';
import { env } from '~/consts/env';
import { auth } from '~/lib/auth/core';
import { db } from '~/lib/db';
import { setEdgeCache } from '~/lib/edge-cache';
import {
  type FreshnessBucket,
  getSkillDetail,
  type PopularityBucket,
  type SecurityVerdict,
  type SkillDetailResult,
  type SkillSearchResponse,
  type SkillsSearchParams,
  type SortOption,
  searchSkills,
  type VisibilityFilter
} from '~/lib/skills/data';

async function getViewerUserId(): Promise<string | null> {
  try {
    const session = await auth.api.getSession({ headers: getRequestHeaders() });
    return session?.user?.id ?? null;
  } catch {
    return null;
  }
}

export interface SkillsListParams {
  q: string;
  page: number;
  limit: number;
  sort: SortOption;
  visibility: VisibilityFilter;
  securityVerdict: SecurityVerdict;
  freshness?: FreshnessBucket;
  popularity?: PopularityBucket;
  hasReadme?: boolean;
  atomKind?: string;
}

export const getSkillsList = createServerFn({ method: 'GET' })
  .inputValidator((input: SkillsListParams) => input)
  .handler(async ({ data }): Promise<SkillSearchResponse> => {
    const viewerUserId = await getViewerUserId();
    if (!viewerUserId) setEdgeCache(60);
    const params: SkillsSearchParams = { ...data, requesterUserId: viewerUserId };
    return searchSkills(params);
  });

export const getSkillDetailFn = createServerFn({ method: 'GET' })
  .inputValidator((input: string) => input)
  .handler(async ({ data: name }): Promise<SkillDetailResult | null> => {
    const viewerUserId = await getViewerUserId();
    if (!viewerUserId) setEdgeCache(300);
    return getSkillDetail(name, viewerUserId);
  });

export function skillsListQueryOptions(params: SkillsListParams) {
  return queryOptions({
    queryKey: ['skills', 'list', params],
    queryFn: () => getSkillsList({ data: params }),
    staleTime: 60_000
  });
}

export function skillDetailQueryOptions(name: string) {
  return queryOptions({
    queryKey: ['skills', 'detail', name],
    queryFn: () => getSkillDetailFn({ data: name }),
    staleTime: 60_000
  });
}

export const isTalkEnabledFn = createServerFn({ method: 'GET' }).handler(async (): Promise<boolean> => {
  setEdgeCache(3600);
  return !!env.PROMPT2BOT_API_TOKEN;
});

export interface SimilarSkillSuggestion {
  name: string;
  description: string | null;
}

/**
 * Fuzzy-match a (likely mistyped) skill name to public published skills.
 * Uses Postgres `pg_trgm` similarity. Threshold 0.2 keeps obvious typos in,
 * filters out unrelated matches. Returns top 5 by similarity DESC.
 */
export interface RecentSkill {
  name: string;
  description: string | null;
  publishedAt: string;
  publisher: string;
  scanVerdict: string | null;
}

export const recentSkillsFn = createServerFn({ method: 'GET' }).handler(async (): Promise<RecentSkill[]> => {
  setEdgeCache(300);
  try {
    const rows = await db.execute<{
      name: string;
      description: string | null;
      publishedAt: string;
      publisher: string;
      verdict: string | null;
    }>(sql`
      SELECT
        s.name,
        s.description,
        sv.created_at::text AS "publishedAt",
        u.name AS publisher,
        sr.verdict
      FROM skills s
      JOIN skill_versions sv ON sv.id = (
        SELECT id FROM skill_versions WHERE skill_id = s.id ORDER BY created_at DESC LIMIT 1
      )
      JOIN "user" u ON u.id = s.publisher_id
      LEFT JOIN LATERAL (
        SELECT verdict FROM scan_results WHERE version_id = sv.id ORDER BY created_at DESC LIMIT 1
      ) sr ON true
      WHERE s.visibility = 'public' AND s.status = 'active'
      ORDER BY sv.created_at DESC
      LIMIT 6
    `);
    const list = (rows as unknown as { rows?: RecentSkill[] }).rows ?? rows;
    const arr = Array.isArray(list) ? (list as RecentSkill[]) : [];
    return arr.map((r) => ({
      name: r.name,
      description: r.description,
      publishedAt: r.publishedAt,
      publisher: r.publisher,
      scanVerdict: r.scanVerdict ?? null
    }));
  } catch {
    return [];
  }
});

export function recentSkillsQueryOptions() {
  return queryOptions({
    queryKey: ['skills', 'recent'],
    queryFn: () => recentSkillsFn(),
    staleTime: 60_000
  });
}

export const suggestSimilarSkillsFn = createServerFn({ method: 'GET' })
  .inputValidator((input: string) => input)
  .handler(async ({ data: name }): Promise<SimilarSkillSuggestion[]> => {
    setEdgeCache(600);
    try {
      const rows = await db.execute<{ name: string; description: string | null; sim: number }>(sql`
        SELECT s.name, s.description, similarity(s.name, ${name}) AS sim
        FROM skills s
        WHERE s.visibility = 'public'
          AND s.status = 'active'
          AND similarity(s.name, ${name}) > 0.2
        ORDER BY sim DESC
        LIMIT 5
      `);
      const list = (rows as unknown as { rows?: Array<{ name: string; description: string | null }> }).rows ?? rows;
      const arr = Array.isArray(list) ? list : [];
      return arr.map((r) => ({ name: r.name, description: r.description }));
    } catch {
      return [];
    }
  });
