import { queryOptions } from '@tanstack/react-query';

import { getHomepageStats } from '~/server-fns/homepage';

export function homepageStatsQueryOptions() {
  return queryOptions({
    queryKey: ['homepage', 'stats'],
    queryFn: () => getHomepageStats()
  });
}
