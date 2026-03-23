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
  loader: ({ context }) => {
    const selfhostedAppUrl =
      process.env.TANK_MODE === 'selfhosted' ? process.env.APP_URL || process.env.BETTER_AUTH_URL || '' : '';
    return Promise.all([
      context.queryClient.ensureQueryData(homepageStatsQueryOptions()),
      context.queryClient.ensureQueryData(githubStarsQueryOptions)
    ]).then(([_stats, _stars]) => ({ selfhostedAppUrl }));
  },
  head: () => data,
  component: HomePage
});

function HomePage() {
  const { selfhostedAppUrl } = Route.useLoaderData();
  const { data: stats } = useSuspenseQuery(homepageStatsQueryOptions());
  const { data: starCount } = useSuspenseQuery(githubStarsQueryOptions);
  return (
    <HomeScreen
      publicSkillCount={stats.publicSkillCount}
      starCount={starCount}
      selfhostedAppUrl={selfhostedAppUrl || undefined}
    />
  );
}
