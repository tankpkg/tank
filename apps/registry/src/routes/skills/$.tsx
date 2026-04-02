import { encodeSkillName } from '@internals/helpers';
import { createFileRoute, notFound } from '@tanstack/react-router';

import { BASE_URL, routeHead } from '~/consts/seo';
import { skillDetailQueryOptions } from '~/query/skills';
import { SkillDetailScreen } from '~/screens/skill-detail-screen';

export const Route = createFileRoute('/skills/$')({
  loader: async ({ context, params }) => {
    const rawPath = params._splat ?? '';
    const skillName = decodeURIComponent(rawPath);
    const data = await context.queryClient.ensureQueryData(skillDetailQueryOptions(skillName));
    if (!data) throw notFound();
    return { data, skillName };
  },
  head: ({ loaderData }) => {
    const data = loaderData?.data;
    if (!data) {
      return { meta: [{ title: 'Skill not found | Tank' }] };
    }

    const version = data.latestVersion?.version;
    const title = version ? `${data.name}@${version} | Tank` : `${data.name} | Tank`;
    const description = data.description ?? `AI agent skill published on Tank by ${data.publisher.name}.`;
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
            applicationCategory: 'AI Agent Skill',
            url: `${BASE_URL}/skills/${encodedName}`,
            author: { '@type': 'Person', name: data.publisher.name },
            offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
            ...(version ? { softwareVersion: version } : {})
          })
        }
      ]
    };
  },
  component: SkillDetailPage,
  notFoundComponent: () => (
    <div className="max-w-4xl mx-auto py-16 text-center">
      <h1 className="text-2xl font-bold mb-2">Skill not found</h1>
      <p className="text-muted-foreground">This skill doesn&apos;t exist or hasn&apos;t been published yet.</p>
    </div>
  )
});

function SkillDetailPage() {
  const { data } = Route.useLoaderData();

  return <SkillDetailScreen data={data} />;
}
