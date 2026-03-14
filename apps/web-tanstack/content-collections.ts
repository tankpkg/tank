import { defineCollection, defineConfig } from 'content-collections';
import rehypeRaw from 'rehype-raw';
import rehypeSlug from 'rehype-slug';
import rehypeStringify from 'rehype-stringify';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import { unified } from 'unified';

const docs = defineCollection({
  name: 'docs',
  directory: 'content/docs',
  include: '**/*.mdx',
  schema: (z) => ({
    title: z.string(),
    description: z.string().optional()
  }),
  transform: async (doc) => {
    const result = await unified()
      .use(remarkParse)
      .use(remarkGfm)
      .use(remarkRehype, { allowDangerousHtml: true })
      .use(rehypeRaw)
      .use(rehypeSlug)
      .use(rehypeStringify)
      .process(doc.content);

    return {
      ...doc,
      html: String(result),
      slug: doc._meta.path
    };
  }
});

export default defineConfig({ collections: [docs] });
