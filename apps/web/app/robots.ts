import type { MetadataRoute } from 'next';

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://tankpkg.com';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/dashboard/', '/settings/', '/_next/'],
      },
      // Allow LLM crawlers to access llms.txt files
      {
        userAgent: ['GPTBot', 'ChatGPT-User', 'Claude-Web', 'Anthropic-AI', 'Google-Extended'],
        allow: ['/', '/llms.txt', '/llms-full.txt', '/docs/'],
      },
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
  };
}
