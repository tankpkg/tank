import { createFileRoute } from '@tanstack/react-router';
import { zodValidator } from '@tanstack/zod-adapter';
import { routeHead } from '~/consts/seo';
import { getSession } from '~/lib/auth/session';
import { skillsSearchSchema } from '~/lib/skills/schemas';
import { skillsListQueryOptions } from '~/query/skills';
import { SkillsListScreen } from '~/screens/skills-list-screen';

const headData = routeHead({
  title: 'Browse AI Agent Skills | Tank',
  description:
    'Discover, compare, and install security-verified AI agent skills. Every skill is scanned for credential theft, prompt injection, and supply chain attacks.',
  path: '/skills'
});

export const Route = createFileRoute('/skills/')({
  validateSearch: zodValidator(skillsSearchSchema),
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    const session = await getSession();
    const data = await context.queryClient.ensureQueryData(skillsListQueryOptions({ ...deps, limit: 20 }));
    return { data, isLoggedIn: !!session?.user };
  },
  head: () => headData,
  component: SkillsPage
});

function SkillsPage() {
  const { data, isLoggedIn } = Route.useLoaderData();
  const search = Route.useSearch();

  return (
    <SkillsListScreen
      data={data}
      query={search.q}
      page={search.page}
      sort={search.sort}
      visibility={search.visibility}
      scoreBucket={search.scoreBucket}
      freshness={search.freshness}
      popularity={search.popularity}
      hasReadme={search.hasReadme}
      isLoggedIn={isLoggedIn}
    />
  );
}
