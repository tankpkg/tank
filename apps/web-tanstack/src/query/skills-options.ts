import { queryOptions } from '@tanstack/react-query';

import { getSkillDetailFn, getSkillsList, type SkillsListParams } from '~/server-fns/skills';

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
