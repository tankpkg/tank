import { encodeSkillName } from '@internals/helpers';
import { eq } from 'drizzle-orm';
import type { MetadataRoute } from 'next';

import { db } from '@/lib/db';
import { skills } from '@/lib/db/schema';
import { source } from '@/lib/source';

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://tankpkg.dev';

export const dynamic = 'force-dynamic';
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const docsPages = source.getPages().map((page) => ({
    url: `${BASE_URL}/docs/${page.slugs.join('/')}`,
    lastModified: new Date(),
    changeFrequency: 'weekly' as const,
    priority: 0.8
  }));

  let skillPages: MetadataRoute.Sitemap = [];
  try {
    const publicSkills = await db
      .select({ name: skills.name, updatedAt: skills.updatedAt })
      .from(skills)
      .where(eq(skills.visibility, 'public'));

    skillPages = publicSkills.map((skill) => ({
      url: `${BASE_URL}/skills/${encodeSkillName(skill.name)}`,
      lastModified: skill.updatedAt,
      changeFrequency: 'weekly' as const,
      priority: 0.7
    }));
  } catch {
    // DB unavailable at build time — static pages still work
  }

  const staticPages: MetadataRoute.Sitemap = [
    {
      url: BASE_URL,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1
    },
    {
      url: `${BASE_URL}/skills`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.9
    },
    {
      url: `${BASE_URL}/docs`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.8
    }
  ];

  return [...staticPages, ...skillPages, ...docsPages];
}
