import { createServerFn } from '@tanstack/react-start';

import docsData from '~/generated/docs.json';

export interface DocEntry {
  title: string;
  description?: string;
  slug: string;
  html: string;
  headings: { id: string; text: string; level: number }[];
}

const docs: DocEntry[] = docsData as DocEntry[];

export const getDocBySlug = createServerFn({ method: 'GET' })
  .inputValidator((slug: string) => slug)
  .handler(async ({ data: slug }) => {
    const normalized = slug === '' || slug === 'index' ? '' : slug;
    const doc = docs.find((d) => d.slug === normalized);
    return doc ?? null;
  });

export const getAllDocs = createServerFn({ method: 'GET' }).handler(async () => {
  return docs.map(({ title, description, slug }) => ({ title, description, slug }));
});
