import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { env } from "~/consts/env";
import { auth } from "~/lib/auth/core";
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
  type VisibilityFilter,
} from "~/lib/skills/data";

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

export const getSkillsList = createServerFn({ method: "GET" })
  .inputValidator((input: SkillsListParams) => input)
  .handler(async ({ data }): Promise<SkillSearchResponse> => {
    const viewerUserId = await getViewerUserId();
    const params: SkillsSearchParams = { ...data, requesterUserId: viewerUserId };
    return searchSkills(params);
  });

export const getSkillDetailFn = createServerFn({ method: "GET" })
  .inputValidator((input: string) => input)
  .handler(async ({ data: name }): Promise<SkillDetailResult | null> => {
    const viewerUserId = await getViewerUserId();
    return getSkillDetail(name, viewerUserId);
  });

export function skillsListQueryOptions(params: SkillsListParams) {
  return queryOptions({
    queryKey: ["skills", "list", params],
    queryFn: () => getSkillsList({ data: params }),
    staleTime: 60_000,
  });
}

export function skillDetailQueryOptions(name: string) {
  return queryOptions({
    queryKey: ["skills", "detail", name],
    queryFn: () => getSkillDetailFn({ data: name }),
    staleTime: 60_000,
  });
}

export const isTalkEnabledFn = createServerFn({ method: "GET" }).handler(async (): Promise<boolean> => {
  return !!env.PROMPT2BOT_API_TOKEN;
});
