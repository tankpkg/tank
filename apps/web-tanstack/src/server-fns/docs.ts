import { createServerFn } from '@tanstack/react-start';
import { allDocs } from 'content-collections';

export const getDocBySlug = createServerFn({ method: 'GET' })
  .inputValidator((slug: string) => slug)
  .handler(async ({ data: slug }) => {
    const doc = allDocs.find((d) => d.slug === slug);
    if (!doc) return null;
    return {
      title: doc.title,
      description: doc.description,
      slug: doc.slug,
      html: doc.html
    };
  });

export const getAllDocs = createServerFn({ method: 'GET' }).handler(async () => {
  return allDocs.map((doc) => ({
    title: doc.title,
    description: doc.description,
    slug: doc.slug
  }));
});
