import { queryOptions } from '@tanstack/react-query';
import { createServerFn } from '@tanstack/react-start';

import { GITHUB_REPO } from '~/consts/brand';
import { setEdgeCache } from '~/lib/edge-cache';

export const getGitHubStars = createServerFn({ method: 'GET' }).handler(async () => {
  setEdgeCache(300, 3600);
  try {
    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}`, {
      headers: { Accept: 'application/vnd.github.v3+json' }
    });
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data.stargazers_count === 'number' ? data.stargazers_count : null;
  } catch {
    return null;
  }
});

export const githubStarsQueryOptions = queryOptions({
  queryKey: ['github', 'stars'],
  queryFn: () => getGitHubStars(),
  staleTime: 3600000
});
