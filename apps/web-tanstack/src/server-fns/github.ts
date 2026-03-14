import { createServerFn } from '@tanstack/react-start';

const GITHUB_REPO = 'tankpkg/tank';

export const getGitHubStars = createServerFn({ method: 'GET' }).handler(async () => {
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
