import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';

import { routeHead } from '~/consts/seo';
import { githubStarsQueryOptions } from '~/query/github';
import { homepageStatsQueryOptions } from '~/query/homepage';
import { recentSkillsQueryOptions } from '~/query/skills';
import { HomeScreen } from '~/screens/home-screen';

const data = routeHead({
  title: 'Tank — Security-first package manager for AI agent packages',
  description:
    'Every package is scanned for credential theft, prompt injection, and supply chain attacks before installation.',
  path: '/'
});

export const Route = createFileRoute('/')({
  loader: async ({ context }) => {
    const { getAppUrl } = await import('~/lib/app-url');
    const selfhostedAppUrl = process.env.TANK_MODE === 'selfhosted' ? getAppUrl() : '';
    return Promise.all([
      context.queryClient.ensureQueryData(homepageStatsQueryOptions()),
      context.queryClient.ensureQueryData(githubStarsQueryOptions),
      context.queryClient.ensureQueryData(recentSkillsQueryOptions())
    ]).then(() => ({ selfhostedAppUrl }));
  },
  head: () => data,
  component: HomePage
});

function HomePage() {
  const { selfhostedAppUrl } = Route.useLoaderData();
  const { data: stats } = useSuspenseQuery(homepageStatsQueryOptions());
  const { data: starCount } = useSuspenseQuery(githubStarsQueryOptions);
  const { data: recentSkills } = useSuspenseQuery(recentSkillsQueryOptions());
  return (
    <HomeScreen
      publicSkillCount={stats.publicSkillCount}
      starCount={starCount}
      recentSkills={recentSkills}
      selfhostedAppUrl={selfhostedAppUrl || undefined}
    />
  );
}
