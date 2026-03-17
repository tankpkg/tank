import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';

import { routeHead } from '~/consts/seo';
import { githubStarsQueryOptions } from '~/query/github';
import { homepageStatsQueryOptions } from '~/query/homepage';
import { HomeScreen } from '~/screens/home-screen';

const data = routeHead({
  title: 'Tank — Security-first package manager for AI agent skills',
  description:
    'Every skill is scanned for credential theft, prompt injection, and supply chain attacks before installation.',
  path: '/'
});

export const Route = createFileRoute('/')({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(homepageStatsQueryOptions()),
      context.queryClient.ensureQueryData(githubStarsQueryOptions)
    ]),
  head: () => data,
  component: HomePage
});

function HomePage() {
  const { data: stats } = useSuspenseQuery(homepageStatsQueryOptions());
  const { data: starCount } = useSuspenseQuery(githubStarsQueryOptions);
  return <HomeScreen publicSkillCount={stats.publicSkillCount} starCount={starCount} />;
}
