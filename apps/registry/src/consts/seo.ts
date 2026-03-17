export const SITE_NAME = 'Tank';
export const BASE_URL = 'https://www.tankpkg.dev';

interface RouteHeadOptions {
  title: string;
  description: string;
  path: string;
  image?: string;
}

export function routeHead({ title, description, path, image }: RouteHeadOptions) {
  const url = `${BASE_URL}${path}`;
  return {
    meta: [
      { title },
      { name: 'description', content: description },
      { property: 'og:title', content: title },
      { property: 'og:description', content: description },
      { property: 'og:url', content: url },
      ...(image
        ? [
            { property: 'og:image', content: image },
            { name: 'twitter:image', content: image }
          ]
        : []),
      { name: 'twitter:title', content: title },
      { name: 'twitter:description', content: description }
    ],
    links: [{ rel: 'canonical', href: url }]
  };
}
