import { createServerFn } from '@tanstack/react-start';
import { getRequestHeaders } from '@tanstack/react-start/server';

import { auth } from '~/lib/auth/core';
import {
  type FreshnessBucket,
  getSkillDetail,
  type PopularityBucket,
  type ScoreBucket,
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
  scoreBucket: ScoreBucket;
  freshness?: FreshnessBucket;
  popularity?: PopularityBucket;
  hasReadme?: boolean;
}

export const getSkillsList = createServerFn({ method: 'GET' })
  .inputValidator((input: SkillsListParams) => input)
  .handler(async ({ data }): Promise<SkillSearchResponse> => {
    const viewerUserId = await getViewerUserId();
    const params: SkillsSearchParams = { ...data, requesterUserId: viewerUserId };
    return searchSkills(params);
  });

export const getSkillDetailFn = createServerFn({ method: 'GET' })
  .inputValidator((input: string) => input)
  .handler(async ({ data: name }): Promise<SkillDetailResult | null> => {
    const viewerUserId = await getViewerUserId();
    return getSkillDetail(name, viewerUserId);
  });
