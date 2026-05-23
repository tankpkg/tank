import { encodeSkillName } from '@internals/helpers';
import { createFileRoute, Link } from '@tanstack/react-router';

import { BASE_URL, routeHead } from '~/consts/seo';
import {
  isTalkEnabledFn,
  type SimilarSkillSuggestion,
  skillDetailQueryOptions,
  suggestSimilarSkillsFn
} from '~/query/skills';
import { SkillDetailScreen } from '~/screens/skill-detail-screen';

export const Route = createFileRoute('/skills/$')({
  loader: async ({ context, params }) => {
    const rawPath = params._splat ?? '';
    const skillName = decodeURIComponent(rawPath);
    const data = await context.queryClient.ensureQueryData(skillDetailQueryOptions(skillName));
    if (!data) {
      const suggestions = await suggestSimilarSkillsFn({ data: skillName });
      return { data: null, skillName, talkEnabled: false, suggestions };
    }
    const talkEnabled = await isTalkEnabledFn();
    return { data, skillName, talkEnabled, suggestions: [] as SimilarSkillSuggestion[] };
  },
  head: ({ loaderData }) => {
    const data = loaderData?.data;
    if (!data) {
      return { meta: [{ title: 'Package not found | Tank' }] };
    }

    const version = data.latestVersion?.version;
    const title = version ? `${data.name}@${version} | Tank` : `${data.name} | Tank`;
    const description = data.description ?? `AI agent package published on Tank by ${data.publisher.name}.`;
    const encodedName = encodeSkillName(data.name);
    const head = routeHead({
      title,
      description,
      path: `/skills/${encodedName}`,
      image: `${BASE_URL}/api/og/${encodedName}`
    });

    return {
      ...head,
      scripts: [
        {
          type: 'application/ld+json',
          children: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'SoftwareApplication',
            name: data.name,
            description,
            applicationCategory: 'AI Agent Package',
            url: `${BASE_URL}/skills/${encodedName}`,
            author: { '@type': 'Person', name: data.publisher.name },
            offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
            ...(version ? { softwareVersion: version } : {})
          })
        }
      ]
    };
  },
  component: SkillDetailPage
});

function NotFoundView({ skillName, suggestions }: { skillName: string; suggestions: SimilarSkillSuggestion[] }) {
  return (
    <div className="max-w-2xl mx-auto py-16 px-4 sm:px-6 lg:px-8 text-center" data-testid="skill-not-found">
      <h1 className="text-2xl font-bold mb-2">Package not found</h1>
      <p className="text-muted-foreground">
        <span className="font-mono text-foreground/80">{skillName}</span> doesn&apos;t exist or hasn&apos;t been
        published yet.
      </p>

      {suggestions.length > 0 && (
        <div className="mt-8" data-testid="skill-not-found-suggestions">
          <p className="text-sm text-muted-foreground mb-3">Did you mean one of these?</p>
          <ul className="flex flex-col gap-2 max-w-md mx-auto text-left">
            {suggestions.map((s) => (
              <li key={s.name}>
                <Link
                  to="/skills/$"
                  params={{ _splat: encodeSkillName(s.name) }}
                  className="block rounded border border-border hover:border-tank/40 bg-card/30 hover:bg-card/60 px-4 py-2 transition-colors no-underline">
                  <p className="font-mono text-sm text-tank">{s.name}</p>
                  {s.description && (
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{s.description}</p>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-8 flex flex-wrap items-center justify-center gap-3 text-sm">
        <Link to="/skills" search={{} as never} className="text-tank hover:underline font-medium">
          Browse all packages →
        </Link>
      </div>
    </div>
  );
}

function SkillDetailPage() {
  const { data, talkEnabled, skillName, suggestions } = Route.useLoaderData();

  if (!data) {
    return <NotFoundView skillName={skillName} suggestions={suggestions} />;
  }

  return <SkillDetailScreen data={data} talkEnabled={talkEnabled} />;
}
