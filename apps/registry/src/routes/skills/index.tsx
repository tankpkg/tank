import { createFileRoute } from '@tanstack/react-router';
import { zodValidator } from '@tanstack/zod-adapter';
import { routeHead } from '~/consts/seo';
import { useSession } from '~/lib/auth/client';
import { skillsSearchSchema } from '~/lib/skills/schemas';
import { skillsListQueryOptions } from '~/query/skills';
import { SkillsListScreen } from '~/screens/skills-list-screen';

const headData = routeHead({
  title: 'Browse Packages | Tank',
  description:
    'Discover, compare, and install security-verified AI agent packages. Every package is scanned for credential theft, prompt injection, and supply chain attacks.',
  path: '/skills'
});

export const Route = createFileRoute('/skills/')({
  validateSearch: zodValidator(skillsSearchSchema),
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    const data = await context.queryClient.ensureQueryData(skillsListQueryOptions({ ...deps, limit: 20 }));
    return { data };
  },
  head: () => headData,
  component: SkillsPage
});

function SkillsPage() {
  const { data } = Route.useLoaderData();
  const search = Route.useSearch();
  const { data: session } = useSession();
  const isLoggedIn = !!session?.user;

  return (
    <SkillsListScreen
      data={data}
      query={search.q}
      page={search.page}
      sort={search.sort}
      visibility={search.visibility}
      securityVerdict={search.securityVerdict}
      freshness={search.freshness}
      popularity={search.popularity}
      hasReadme={search.hasReadme}
      isLoggedIn={isLoggedIn}
      atomKind={search.atomKind}
    />
  );
}
