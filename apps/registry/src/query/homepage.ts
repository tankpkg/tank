import { queryOptions } from '@tanstack/react-query';
import { createServerFn } from '@tanstack/react-start';
import { count, eq } from 'drizzle-orm';

import { db } from '~/lib/db';
import { skills } from '~/lib/db/schema';

export const getHomepageStats = createServerFn({ method: 'GET' }).handler(async () => {
  try {
    const [row] = await db.select({ count: count() }).from(skills).where(eq(skills.visibility, 'public'));

    return {
      publicSkillCount: row?.count ?? 0
    };
  } catch {
    return {
      publicSkillCount: 0
    };
  }
});

export function homepageStatsQueryOptions() {
  return queryOptions({
    queryKey: ['homepage', 'stats'],
    queryFn: () => getHomepageStats()
  });
}
