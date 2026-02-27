import { source } from '@/lib/source';
import {
  DocsPage,
  DocsBody,
  DocsDescription,
  DocsTitle,
} from 'fumadocs-ui/page';
import { notFound } from 'next/navigation';
import { getMDXComponents } from '@/mdx-components';
import { CopyToLLMButton } from '@/components/copy-to-llm-button';
import { readFile } from 'fs/promises';
import { join } from 'path';
import Script from 'next/script';

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://tankpkg.dev';

async function getRawContent(slug: string[]): Promise<string> {
  try {
    const filePath = join(
      process.cwd(),
      'content/docs',
      slug.length > 0 ? `${slug.join('/')}.mdx` : 'index.mdx'
    );
    return await readFile(filePath, 'utf-8');
  } catch {
    return '';
  }
}

function generateJsonLd(
  title: string,
  description: string | undefined,
  url: string,
  breadcrumbs: { name: string; url: string }[]
) {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'TechArticle',
        '@id': url,
        headline: title,
        description: description || '',
        author: {
          '@type': 'Organization',
          name: 'Tank',
          url: BASE_URL,
        },
        publisher: {
          '@type': 'Organization',
          name: 'Tank',
          url: BASE_URL,
          logo: {
            '@type': 'ImageObject',
            url: `${BASE_URL}/logo.png`,
          },
        },
        mainEntityOfPage: {
          '@type': 'WebPage',
          '@id': url,
        },
        datePublished: '2025-01-01',
        dateModified: new Date().toISOString().split('T')[0],
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          {
            '@type': 'ListItem',
            position: 1,
            name: 'Docs',
            item: `${BASE_URL}/docs`,
          },
          ...breadcrumbs.map((crumb, index) => ({
            '@type': 'ListItem',
            position: index + 2,
            name: crumb.name,
            item: crumb.url,
          })),
        ],
      },
    ],
  };
}

export default async function Page(props: {
  params: Promise<{ slug?: string[] }>;
}) {
  const params = await props.params;
  const page = source.getPage(params.slug ?? []);
  if (!page) notFound();

  const MDX = page.data.body;
  const pageUrl = `${BASE_URL}/docs/${page.slugs.join('/')}`;
  const rawContent = await getRawContent(params.slug ?? []);

  // Generate breadcrumbs for JSON-LD
  const breadcrumbs = page.slugs.map((slug, index) => ({
    name: page.slugs.slice(0, index + 1).join('/'),
    url: `${BASE_URL}/docs/${page.slugs.slice(0, index + 1).join('/')}`,
  }));

  const jsonLd = generateJsonLd(
    page.data.title,
    page.data.description,
    pageUrl,
    breadcrumbs
  );

  return (
    <>
      <Script
        id="json-ld"
        type="application/ld+json"
        strategy="beforeInteractive"
      >
        {JSON.stringify(jsonLd)}
      </Script>
      <DocsPage
        toc={page.data.toc}
        full={page.data.full}
        tableOfContent={{
          footer: (
            <a
              href="https://github.com/tankpkg/tank/tree/main/apps/web/content/docs"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Edit this page on GitHub →
            </a>
          ),
        }}
      >
        <div className="mb-4 flex items-center justify-between">
          <div />
          <CopyToLLMButton
            title={page.data.title}
            description={page.data.description}
            content={rawContent}
            url={pageUrl}
          />
        </div>
        <DocsTitle>{page.data.title}</DocsTitle>
        <DocsDescription>{page.data.description}</DocsDescription>
        <DocsBody>
          <MDX components={getMDXComponents()} />
        </DocsBody>
      </DocsPage>
    </>
  );
}

export async function generateStaticParams() {
  return source.generateParams();
}

export async function generateMetadata(props: {
  params: Promise<{ slug?: string[] }>;
}) {
  const params = await props.params;
  const page = source.getPage(params.slug ?? []);
  if (!page) notFound();

  const pageUrl = `${BASE_URL}/docs/${page.slugs.join('/')}`;

  return {
    title: page.data.title,
    description: page.data.description,
    alternates: {
      canonical: pageUrl,
    },
    openGraph: {
      title: page.data.title,
      description: page.data.description,
      url: pageUrl,
      type: 'article',
      siteName: 'Tank Documentation',
    },
    twitter: {
      card: 'summary_large_image',
      title: page.data.title,
      description: page.data.description,
    },
  };
}
