import { queryOptions, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';

import { homepageStatsQueryOptions } from '~/lib/query/homepage-options';
import { HomeScreen } from '~/screens/home/home-screen';
import { getGitHubStars } from '~/server-fns/github';

function githubStarsQueryOptions() {
  return queryOptions({
    queryKey: ['github', 'stars'],
    queryFn: () => getGitHubStars(),
    staleTime: 3600000
  });
}

export const Route = createFileRoute('/_registry/')({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(homepageStatsQueryOptions()),
      context.queryClient.ensureQueryData(githubStarsQueryOptions())
    ]),
  head: () => ({
    meta: [
      { title: 'Tank | Security-first skills registry' },
      { content: 'Security-first package manager for AI agent skills.', name: 'description' }
    ]
  }),
  component: HomePage
});

function HomePage() {
  const { data: stats } = useSuspenseQuery(homepageStatsQueryOptions());
  const { data: starCount } = useSuspenseQuery(githubStarsQueryOptions());
  return <HomeScreen publicSkillCount={stats.publicSkillCount} starCount={starCount} />;
}
