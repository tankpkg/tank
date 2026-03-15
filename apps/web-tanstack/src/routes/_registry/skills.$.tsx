import { encodeSkillName } from '@internals/helpers';
import { createFileRoute, notFound } from '@tanstack/react-router';

import { skillDetailQueryOptions } from '~/query/skills-options';
import { SkillDetailScreen } from '~/screens/skills/skill-detail-screen';

export const Route = createFileRoute('/_registry/skills/$')({
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
    const title = version ? `${data.name}@${version}` : data.name;
    const description = data.description ?? `AI agent skill published on Tank by ${data.publisher.name}.`;
    const url = `https://tankpkg.dev/skills/${encodeSkillName(data.name)}`;

    return {
      meta: [
        { title: `${title} | Tank` },
        { name: 'description', content: description },
        { property: 'og:title', content: `${title} — Tank` },
        { property: 'og:description', content: description },
        { property: 'og:url', content: url },
        { property: 'og:type', content: 'website' },
        { property: 'og:site_name', content: 'Tank' },
        { property: 'og:image', content: `https://www.tankpkg.dev/api/og/${encodeSkillName(data.name)}` },
        { name: 'twitter:card', content: 'summary_large_image' },
        { name: 'twitter:title', content: `${title} — Tank` },
        { name: 'twitter:description', content: description },
        { name: 'twitter:image', content: `https://www.tankpkg.dev/api/og/${encodeSkillName(data.name)}` }
      ],
      links: [{ rel: 'canonical', href: `https://www.tankpkg.dev/skills/${encodeSkillName(data.name)}` }],
      scripts: [
        {
          type: 'application/ld+json',
          children: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'SoftwareApplication',
            name: data.name,
            description,
            applicationCategory: 'AI Agent Skill',
            url,
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
