declare module 'content-collections' {
  export function defineCollection(options: {
    name: string;
    directory: string;
    include: string;
    schema: (z: any) => Record<string, any>;
    transform: (doc: any) => Promise<any>;
  }): any;

  export function defineConfig(options: { collections: any[] }): any;

  export const allDocs: Array<{
    title: string;
    description?: string;
    slug: string;
    html: string;
    content: string;
    _meta: { path: string; fileName: string };
  }>;
}
