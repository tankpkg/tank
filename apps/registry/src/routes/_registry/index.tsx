import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';

import { githubStarsQueryOptions } from '~/query/github';
import { homepageStatsQueryOptions } from '~/query/homepage';
import { HomeScreen } from '~/screens/home-screen';

export const Route = createFileRoute('/_registry/')({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(homepageStatsQueryOptions()),
      context.queryClient.ensureQueryData(githubStarsQueryOptions)
    ]),
  head: () => ({
    meta: [
      { title: 'Tank — Security-first package manager for AI agent skills' },
      {
        name: 'description',
        content:
          'Every skill is scanned for credential theft, prompt injection, and supply chain attacks before installation.'
      },
      { property: 'og:title', content: 'Tank — Security-first package manager for AI agent skills' },
      {
        property: 'og:description',
        content:
          'Every skill is scanned for credential theft, prompt injection, and supply chain attacks before installation.'
      },
      { property: 'og:url', content: 'https://www.tankpkg.dev' },
      { property: 'og:type', content: 'website' },
      { property: 'og:site_name', content: 'Tank' },
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:title', content: 'Tank — Security-first package manager for AI agent skills' },
      {
        name: 'twitter:description',
        content:
          'Every skill is scanned for credential theft, prompt injection, and supply chain attacks before installation.'
      }
    ],
    links: [{ rel: 'canonical', href: 'https://www.tankpkg.dev/' }]
  }),
  component: HomePage
});

function HomePage() {
  const { data: stats } = useSuspenseQuery(homepageStatsQueryOptions());
  const { data: starCount } = useSuspenseQuery(githubStarsQueryOptions);
  return <HomeScreen publicSkillCount={stats.publicSkillCount} starCount={starCount} />;
}
